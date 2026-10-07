// Guards the lazy-loading boundaries: no module the app loads with `import()`
// may also be reachable from the entry through static imports (refactor WP3,
// guard G5).
//
// A static import on the path that loads a module anyway quietly defeats every
// `lazy(() => import(...))` of it: the bundler folds the target into the chunk
// that imports it statically. The build only prints a warning, nothing fails,
// and the only symptom is a heavier load. That happened to DiffViewModal and
// AudioWiringModal and was found by hand (2efd73fc). Zero boundaries are
// defeated today; this keeps it so while modal code moves around.
//
// The rule, as measured in the refactor scan (timeline-lazy-complexity.md B.5):
//
// 1. Lazy targets: every `import('<literal>')` in a non-test source file that
//    resolves inside packages/app/src. Test files are left out, which is what
//    keeps their module-reset imports from counting as boundaries.
// 2. The eager graph: breadth-first from index.tsx AND App.tsx, following
//    `import ... from` and `export ... from` that are not type-only. App.tsx is
//    a root because index.tsx awaits `import('./App')` unconditionally on every
//    path but /benchmarks, so its closure is eager in fact although that edge
//    is dynamic. Type-only imports erase at compile time and pull in nothing.
//    Stylesheets are not followed: importing a lazy component's `.module.css`
//    eagerly does not pull its JavaScript (WorkspaceSidebar.tsx imports
//    DiffViewModal.module.css on purpose).
// 3. No lazy target may be in the eager graph, apart from the two roots.
//
// And one more, beyond the scan's rule, because the entry-rooted rule alone
// cannot see the defect 2efd73fc fixed: WorkspaceSidebar is not eager, it
// lives in the lazily-loaded MainWorkspace chunk. Its static import of
// DiffViewModal folded the modal into that chunk, so MainWorkspace's own
// `lazy(() => import(...DiffViewModal))` loaded nothing on demand.
//
// 4. No lazy target may be statically reachable from a module that imports
//    it lazily. When that module loads, the target already has.
//
// The scan reads the tree through the filesystem, so it is on the always-on
// list (scripts/always-on-tests.mjs).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SRC = import.meta.dirname

/**
 * Lazy targets that are allowed to be eager anyway. Empty, and it should stay
 * hard to add to: each entry needs the module (relative to src/), why the
 * eager copy is worth it, and what it costs in bytes (gzip) on the first load.
 */
const ALLOWED_EAGER_LAZY_TARGETS: readonly {
  module: string
  why: string
  gzipBytes: number
}[] = []

/** The Vite entry, and the module it always awaits (see the header). */
const ROOTS = ['index.tsx', 'App.tsx']

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, acc)
    else if (/\.tsx?$/.test(name) && !/\.(test|spec|d)\.tsx?$/.test(name))
      acc.push(full)
  }
  return acc
}

const posix = (p: string) => p.split('\\').join('/')

type Edge = { to: string; line: number; text: string }
type LazySite = { from: string; line: number }
type ModuleGraph = {
  /** Static, value-level edges, by importing module. */
  edges: Map<string, Edge[]>
  /** Every `import()` of a module inside src/, by target. */
  lazy: Map<string, LazySite[]>
}

/**
 * Resolve a specifier the way the app's bundler does, or return undefined for
 * anything outside the source set: packages, stylesheets, `?raw` and `?url`
 * queries, SVGs.
 */
function resolveSpecifier(
  from: string,
  spec: string,
  known: ReadonlySet<string>,
): string | undefined {
  let base: string
  if (spec.startsWith('@/')) base = spec.slice(2)
  else if (spec.startsWith('./') || spec.startsWith('../'))
    base = posix(join(dirname(from), spec))
  else return undefined
  const candidates = /\.tsx?$/.test(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
  return candidates.find((c) => known.has(c))
}

/** The declaration pulls in a value, not only types. */
function isValueEdge(node: ts.ImportDeclaration | ts.ExportDeclaration) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause
    if (clause === undefined) return true // `import './x'`, for its effects
    if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return false
    if (clause.name !== undefined) return true
    const bindings = clause.namedBindings
    if (bindings === undefined || ts.isNamespaceImport(bindings)) return true
    return (
      bindings.elements.length === 0 ||
      bindings.elements.some((element) => !element.isTypeOnly)
    )
  }
  if (node.isTypeOnly) return false
  const clause = node.exportClause
  if (clause === undefined || ts.isNamespaceExport(clause)) return true
  return (
    clause.elements.length === 0 ||
    clause.elements.some((element) => !element.isTypeOnly)
  )
}

/** Build the graph from source texts keyed by path relative to src/. */
function buildGraph(files: ReadonlyMap<string, string>): ModuleGraph {
  const known = new Set(files.keys())
  const graph: ModuleGraph = { edges: new Map(), lazy: new Map() }
  for (const [file, text] of files) {
    const ast = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const lineOf = (n: ts.Node) =>
      ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1
    const edges: Edge[] = []
    for (const statement of ast.statements) {
      if (
        (ts.isImportDeclaration(statement) ||
          ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        isValueEdge(statement)
      ) {
        const to = resolveSpecifier(file, statement.moduleSpecifier.text, known)
        if (to !== undefined) {
          edges.push({
            to,
            line: lineOf(statement),
            text: statement.getText(ast).replace(/\s+/g, ' '),
          })
        }
      }
    }
    graph.edges.set(file, edges)
    const walk = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const arg = node.arguments[0]
        const target =
          arg !== undefined &&
          (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
            ? resolveSpecifier(file, arg.text, known)
            : undefined
        if (target !== undefined) {
          const sites = graph.lazy.get(target) ?? []
          sites.push({ from: file, line: lineOf(node) })
          graph.lazy.set(target, sites)
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(ast)
  }
  return graph
}

/** Breadth-first from the roots, keeping how each module was first reached. */
function eagerReach(graph: ModuleGraph, roots: readonly string[]) {
  const via = new Map<string, { from: string; edge: Edge } | null>()
  const queue: string[] = []
  for (const root of roots) {
    if (graph.edges.has(root)) {
      via.set(root, null)
      queue.push(root)
    }
  }
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const edge of graph.edges.get(next) ?? []) {
      if (via.has(edge.to)) continue
      via.set(edge.to, { from: next, edge })
      queue.push(edge.to)
    }
  }
  return via
}

/** `index.tsx -> App.tsx -> X.tsx`, plus the import that closes the chain. */
function chainTo(target: string, via: ReturnType<typeof eagerReach>): string {
  const chain = [target]
  let closing: { from: string; edge: Edge } | undefined
  for (let step = via.get(target); step; step = via.get(step.from)) {
    closing ??= step
    chain.unshift(step.from)
  }
  const importLine = closing
    ? ` (${closing.from}:${closing.edge.line}: ${closing.edge.text})`
    : ''
  return `${chain.join(' -> ')}${importLine}`
}

/** Lazy targets that load before their lazy import runs, with an account. */
function defeatedBoundaries(
  graph: ModuleGraph,
  roots: readonly string[],
  allowed: ReadonlySet<string> = new Set(),
): string[] {
  const eager = eagerReach(graph, roots)
  const offenders: string[] = []
  for (const [target, sites] of [...graph.lazy].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (roots.includes(target) || allowed.has(target)) continue
    const lazyAt = sites.map((s) => `${s.from}:${s.line}`).join(', ')
    if (eager.has(target)) {
      offenders.push(
        `${target} is loaded lazily at ${lazyAt}, but the eager graph ` +
          `reaches it statically: ${chainTo(target, eager)}`,
      )
      continue
    }
    for (const site of sites) {
      const local = eagerReach(graph, [site.from])
      if (site.from === target || !local.has(target)) continue
      offenders.push(
        `${target} is loaded lazily at ${site.from}:${site.line}, but ` +
          `${site.from} already imports it statically: ${chainTo(target, local)}`,
      )
    }
  }
  return offenders
}

describe('lazy-loading boundaries', () => {
  const files = new Map(
    sourceFiles(SRC).map((full) => [
      posix(relative(SRC, full)),
      readFileSync(full, 'utf8'),
    ]),
  )
  const graph = buildGraph(files)

  it('sees the boundaries and the eager graph it is meant to check', () => {
    // A resolver that stops resolving would find no targets and no graph, and
    // pass. These numbers are far below today's (24 targets, ~700 modules).
    expect(graph.lazy.has('MainWorkspace.tsx')).toBe(true)
    expect(graph.lazy.size).toBeGreaterThanOrEqual(15)
    expect(eagerReach(graph, ROOTS).size).toBeGreaterThanOrEqual(300)
  })

  it('loads no lazy target before its lazy import runs', () => {
    const allowed = new Set(ALLOWED_EAGER_LAZY_TARGETS.map((a) => a.module))
    // Keep the static import off the eager path: import the module lazily
    // there too, or move what the eager code needs into a small module of its
    // own that the lazy one imports.
    expect(defeatedBoundaries(graph, ROOTS, allowed)).toEqual([])
  })
})

describe('the lazy-boundary scan itself', () => {
  const run = (extra: Record<string, string>) =>
    defeatedBoundaries(
      buildGraph(
        new Map(
          Object.entries({
            'index.tsx': `import './lib/boot'\nconst App = await import('./App')`,
            'lib/boot.ts': `export const boot = 1`,
            'Modal.tsx': `export const Modal = () => null`,
            'Panel.tsx': `export const Panel = () => null`,
            ...extra,
          }),
        ),
      ),
      ['index.tsx', 'App.tsx'],
    )

  it('reports a static import of a lazy target, with the chain to it', () => {
    expect(
      run({
        'App.tsx': `import { Shell } from './Shell'\nconst M = lazy(() => import('./Modal'))`,
        'Shell.tsx': `export { Modal } from '@/Modal'\nexport const Shell = 1`,
      }),
    ).toEqual([
      "Modal.tsx is loaded lazily at App.tsx:2, but the eager graph reaches it statically: App.tsx -> Shell.tsx -> Modal.tsx (Shell.tsx:1: export { Modal } from '@/Modal')",
    ])
  })

  it('reports a lazy target its own lazy importer already loads', () => {
    expect(
      run({
        'App.tsx': `const W = lazy(() => import('./Workspace'))`,
        'Workspace.tsx': `import { Sidebar } from './Sidebar'\nconst M = lazy(() => import('./Modal'))`,
        'Sidebar.tsx': `import { Modal } from './Modal'\nexport const Sidebar = 1`,
      }),
    ).toEqual([
      "Modal.tsx is loaded lazily at Workspace.tsx:2, but Workspace.tsx already imports it statically: Workspace.tsx -> Sidebar.tsx -> Modal.tsx (Sidebar.tsx:1: import { Modal } from './Modal')",
    ])
  })

  it('ignores type-only imports and stylesheets', () => {
    expect(
      run({
        'App.tsx': [
          `import type { Modal } from './Modal'`,
          `import { type Panel } from './Panel'`,
          `import styles from './Modal.module.css'`,
          `const M = lazy(() => import('./Modal'))`,
          `const P = lazy(() => import('./Panel'))`,
        ].join('\n'),
      }),
    ).toEqual([])
  })
})
