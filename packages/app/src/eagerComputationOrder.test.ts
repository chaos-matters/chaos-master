// Guards against an eagerly-run Solid computation reading a binding that is
// declared further down the same scope.
//
// `createMemo` and its siblings run their callback once, immediately, at
// creation. So a callback that reads a `const` declared later in the enclosing
// function body reads it inside its temporal dead zone and throws
// `ReferenceError: Cannot access 'x' before initialization` -- mid-component,
// which an ErrorBoundary turns into a crash screen.
//
// Nothing else catches it. TypeScript is happy, because the reference is
// inside a closure that TypeScript cannot prove runs early. Tests are happy
// too whenever a `&&` in front of the read short-circuits on the data they
// use: `resolvedBlendWeight` in MainWorkspace read `timeline` 175 lines before
// it was declared and shipped for months, because `blendFlame() &&` came
// first and the default flame carries no blend. Every share link of a blended
// flame was broken. See tests/blend-mount.ci.spec.ts.
//
// `createEffect` is deliberately NOT in the list: it queues its callback and
// Solid runs it after the component body has finished, so a later `const` is
// already initialised by then. Adding it here would flag hundreds of correct
// effects. `createReaction` is out for the same reason -- its computation is
// created not-stale and only runs when the returned tracker is called.
//
// The scan is purely syntactic, which is sound for this rule: a `const x` in a
// block shadows any outer `x` for that whole block, so a later declaration of
// a name the callback reads IS the hazard, whatever else is in scope.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SRC = import.meta.dirname

/**
 * Solid primitives that run their callback synchronously at creation.
 * Verified against solid-js 1.9.11 `dist/solid.js`: each one reaches
 * `updateComputation(...)` on the spot, outside a transition.
 *
 * `createResource` too, for both of its function arguments: a function
 * source becomes a `createMemo`, and `load(false)` runs at creation and calls
 * the fetcher unless the source value is `null` or `false`. The fetcher's
 * throw is caught and stored as the resource's error, so the ReferenceError
 * surfaces where the resource is read rather than at the call, but it is the
 * same dead binding.
 */
const EAGER = new Set([
  'createMemo',
  'createComputed',
  'createRenderEffect',
  'createDeferred',
  'createSelector',
  'createResource',
])

/** The primitives whose every function argument runs, not only the first. */
const EAGER_EVERY_ARGUMENT = new Set(['createResource'])

/** TDZ bindings. `var` and `function` hoist, so they cannot be the hazard. */
function isTemporalDeadZone(node: ts.Node): boolean {
  if (ts.isClassDeclaration(node)) return true
  if (!ts.isVariableStatement(node)) return false
  const flags = node.declarationList.flags
  return (flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)) !== 0
}

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

/** The names a binding pattern introduces. Initializers are not descended. */
function bindingNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text)
    return
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) bindingNames(element.name, into)
  }
}

/**
 * What a statement puts into the scope AROUND it -- nothing more.
 *
 * Descending into initializers would be wrong: `const X = (() => { const rest
 * = ... })()` declares `X`, not `rest`, and reporting `rest` made two correct
 * memos look like offenders.
 */
function statementBindings(statement: ts.Statement): Set<string> {
  const names = new Set<string>()
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      bindingNames(declaration.name, names)
    }
  } else if (ts.isClassDeclaration(statement) && statement.name) {
    names.add(statement.name.text)
  }
  return names
}

/**
 * Every name bound anywhere inside the callback, so a read that resolves to
 * the callback's own binding is not reported. Deliberately over-inclusive: a
 * name bound in a function nested inside the callback counts too. That can
 * hide a hazard where the same name is both read from outside and bound
 * deeper in, which is rare and is the safe direction to err in for a guard
 * that has to stay purely syntactic.
 */
function declaredNames(node: ts.Node, into: Set<string>): void {
  const walk = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n)) {
      bindingNames(n.name, into)
    } else if (
      (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) &&
      n.name !== undefined
    ) {
      into.add(n.name.text)
    }
    ts.forEachChild(n, walk)
  }
  ts.forEachChild(node, walk)
}

/** Identifiers the callback actually reads, minus what it binds itself. */
function readNames(callback: ts.Node): Set<string> {
  const bound = new Set<string>()
  declaredNames(callback, bound)
  const names = new Set<string>()
  const walk = (n: ts.Node) => {
    if (ts.isIdentifier(n)) {
      const parent = n.parent
      const isMemberName =
        (ts.isPropertyAccessExpression(parent) && parent.name === n) ||
        (ts.isPropertyAssignment(parent) && parent.name === n) ||
        (ts.isPropertySignature(parent) && parent.name === n) ||
        (ts.isBindingElement(parent) && parent.propertyName === n) ||
        ts.isPropertyDeclaration(parent) ||
        ts.isMethodDeclaration(parent)
      if (!isMemberName && !bound.has(n.text)) names.add(n.text)
    }
    ts.forEachChild(n, walk)
  }
  ts.forEachChild(callback, walk)
  return names
}

type Offender = {
  file: string
  computation: string
  readName: string
  usedAtLine: number
  declaredAtLine: number
}

/**
 * Statements that live directly in a scope, for every scope enclosing `node`.
 * A block, a function body and the file itself all qualify: a `const` in any
 * of them is in the dead zone until its own line is reached.
 */
function enclosingStatementLists(node: ts.Node): ts.NodeArray<ts.Statement>[] {
  const lists: ts.NodeArray<ts.Statement>[] = []
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n)) {
      lists.push(n.statements)
    }
  }
  return lists
}

function scan(file: string, text: string): Offender[] {
  const ast = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const offenders: Offender[] = []
  const lineOf = (pos: number) =>
    ast.getLineAndCharacterOfPosition(pos).line + 1

  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const primitive = node.expression.text
      const callbacks = EAGER.has(primitive)
        ? (EAGER_EVERY_ARGUMENT.has(primitive)
            ? node.arguments
            : node.arguments.slice(0, 1)
          ).filter((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a))
        : []
      if (callbacks.length > 0) {
        // One set per call, so a binding read by two arguments is one offender.
        const reads = new Set(callbacks.flatMap((c) => [...readNames(c)]))
        for (const statements of enclosingStatementLists(node)) {
          for (const statement of statements) {
            // Only what comes after the computation is in its dead zone.
            if (statement.getStart(ast) <= node.getStart(ast)) continue
            if (!isTemporalDeadZone(statement)) continue
            for (const name of statementBindings(statement)) {
              if (!reads.has(name)) continue
              offenders.push({
                file,
                computation: primitive,
                readName: name,
                usedAtLine: lineOf(node.getStart(ast)),
                declaredAtLine: lineOf(statement.getStart(ast)),
              })
            }
          }
        }
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(ast)
  return offenders
}

describe('eagerly-run Solid computations', () => {
  it('reads no binding declared later in an enclosing scope', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      scan(file, readFileSync(file, 'utf8')).map(
        (o) =>
          `${relative(SRC, o.file)}:${o.usedAtLine}: ${o.computation} reads '${o.readName}', ` +
          `declared at ${relative(SRC, o.file)}:${o.declaredAtLine}`,
      ),
    )
    // Reorder so the computation comes after everything it reads. Do not guard
    // the read, and do not reorder the `&&` in front of it: that puts the
    // defect back behind a different short-circuit.
    expect(offenders).toEqual([])
  })
})

// ── Across the hook boundary (refactor WP3, guard G3) ──────────────────────
//
// The rule above sees declaration order inside one file. Moving code out of
// MainWorkspace into `useWorkspace*` hooks moves the eager read to where it
// cannot see it: the memo now lives in the hook and calls `params.x()`, while
// the closure that reads the late binding is written at the call site, in
// another file.
//
//   // MainWorkspace.tsx
//   const camera = useWorkspaceCamera({ driving: () => timeline.isDrivingView() })
//   const timeline = createTimelineState()        // declared after the call
//
//   // hooks/useWorkspaceCamera.ts
//   const autoExposure = createMemo(() => blended() && params.driving())
//
// That is #98 again, one file removed. So this part runs in two steps.
//
// 1. For every `useWorkspace*` hook: what it does with each parameter while
//    the hook call itself is still running. That is the hook body outside any
//    nested function, the callback of an eager primitive above, a callback
//    run before its call returns (`untrack`, `batch`, array iteration), an
//    IIFE, and a local function the eager code calls. Three things are told
//    apart, because they run different parts of an argument:
//    - reading the parameter at all (destructuring included) runs a getter
//      passed for it;
//    - calling it (`p()`, or `p[k]`, which is taken whole) runs the function
//      passed for it;
//    - using one member (`p.m()`, `p.m.x`) runs that member of an object
//      passed for it, and reading one (`p.m`) runs it if it is a getter.
//
// 2. At every call site, the part of the argument that runs may not reach a
//    binding declared later in the caller's scope, or declared by the
//    statement that makes the call. "Reach" follows closures inside the
//    argument, and on through a `const` of the caller whose initializer is a
//    function or an object literal, and through a function declaration of the
//    caller: passing `readLate` where `const readLate = () => late()` is the
//    same hazard as writing the arrow inline.
//
// Deliberately out of scope, so the rule stays syntactic and quiet:
// - A parameter handed whole to another function (`register(ctx)`) is not
//   followed into that function. tests/kitchen-sink-mount.ci.spec.ts is the
//   runtime net for what the scan cannot see.
// - A local function called with an alias under another name is not traced
//   parameter by parameter.
//
// The measured alternative, "a hook argument is a direct reference and never
// a closure over a later binding", is red on today's tree at two correct call
// sites: `useWorkspaceCamera` receives three closures over `timeline` and one
// over `setRenderSetting`, and `useWorkspaceBlendPick` one over `cmdContext`,
// all declared after the call. Neither hook runs them while it runs.
// Reordering MainWorkspace to satisfy that rule would move code to please a
// guard, so this precise rule is the one enforced.

/** Callees that run a function argument before they return. */
const SYNC_CALLBACK_CALLEES = new Set([
  'untrack',
  'batch',
  'createRoot',
  'runWithOwner',
])
/** Methods that call their callback before returning (arrays, mostly). */
const SYNC_CALLBACK_METHODS = new Set([
  'map',
  'forEach',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'some',
  'every',
  'reduce',
  'reduceRight',
  'flatMap',
  'sort',
  'toSorted',
])

// The `stores/createWorkspace<Name>Store()` factories count as hooks: WP5's
// design rule puts workspace state in them, and a factory that builds a memo
// over a parameter runs it at the call exactly like a hook does. A forward
// read planted through `createWorkspaceExportStore` was green before they
// were added here (WP3b, 2026-09-23).
const HOOK_NAME = /^(useWorkspace[A-Z]\w*|createWorkspace[A-Z]\w*Store)$/

type FunctionNode =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration
  | ts.ConstructorDeclaration

function isFunctionNode(n: ts.Node): n is FunctionNode {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isGetAccessorDeclaration(n) ||
    ts.isSetAccessorDeclaration(n) ||
    ts.isConstructorDeclaration(n)
  )
}

function unwrap(e: ts.Expression): ts.Expression {
  let out = e
  while (
    ts.isParenthesizedExpression(out) ||
    ts.isAsExpression(out) ||
    ts.isSatisfiesExpression(out) ||
    ts.isNonNullExpression(out)
  ) {
    out = out.expression
  }
  return out
}

/** The nearest ancestor that is not a parenthesis or a `!`, and its child. */
function usingParent(n: ts.Node): { child: ts.Node; parent: ts.Node } {
  let child = n
  let parent = n.parent
  while (
    ts.isParenthesizedExpression(parent) ||
    ts.isNonNullExpression(parent)
  ) {
    child = parent
    parent = parent.parent
  }
  return { child, parent }
}

/** `fn` is run before the expression it sits in returns. */
function runsImmediately(fn: ts.Node): boolean {
  const { child, parent } = usingParent(fn)
  if (!ts.isCallExpression(parent)) return false
  if (parent.expression === child) return true
  if (!parent.arguments.some((a) => a === child)) return false
  const callee = parent.expression
  if (ts.isIdentifier(callee)) {
    return EAGER.has(callee.text) || SYNC_CALLBACK_CALLEES.has(callee.text)
  }
  return (
    ts.isPropertyAccessExpression(callee) &&
    SYNC_CALLBACK_METHODS.has(callee.name.text)
  )
}

/** The value of `expr` is called or dereferenced right where it stands. */
function isInvokedOrDereferenced(expr: ts.Node): boolean {
  const { child, parent } = usingParent(expr)
  return (
    (ts.isCallExpression(parent) && parent.expression === child) ||
    ((ts.isPropertyAccessExpression(parent) ||
      ts.isElementAccessExpression(parent)) &&
      parent.expression === child)
  )
}

/** An identifier in a position that names something rather than reading it. */
function isNamePosition(n: ts.Identifier): boolean {
  const parent = n.parent
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === n) ||
    (ts.isPropertyAssignment(parent) && parent.name === n) ||
    (ts.isPropertySignature(parent) && parent.name === n) ||
    (ts.isBindingElement(parent) &&
      (parent.propertyName === n || parent.name === n)) ||
    (ts.isVariableDeclaration(parent) && parent.name === n) ||
    (ts.isParameter(parent) && parent.name === n) ||
    (ts.isFunctionDeclaration(parent) && parent.name === n) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isMethodDeclaration(parent)
  )
}

/**
 * What a hook does with one parameter while it runs. Each field holds the
 * line of the first time it happens.
 */
type ParamUse = {
  /** Read at all: a getter passed for it runs. */
  read?: number
  /** Called, or indexed: the whole argument is taken to run. */
  called?: number
  /** `p.m` read: member `m` runs if it is a getter. */
  memberRead: Map<string, number>
  /** `p.m()` or `p.m.x`: member `m` runs. */
  memberUsed: Map<string, number>
}

type EagerParams = {
  hook: string
  file: string
  /**
   * Keyed `slot:prop`, where `slot` is the parameter's position and `prop` a
   * property of the object passed there. `slot:` (empty prop) is the
   * positional parameter itself.
   */
  uses: Map<string, ParamUse>
}

/** Which parameter a local name stands for: `slot`, and `prop` below it. */
type ParamAlias = { slot: number; prop?: string }

const propertyNameText = (name: ts.PropertyName | undefined) =>
  name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? name.text
    : undefined

/** The parameter an initializer stands for: an alias of one, or `params.x`. */
function aliasSource(
  init: ts.Expression,
  aliases: ReadonlyMap<string, ParamAlias>,
): ParamAlias | undefined {
  if (ts.isIdentifier(init)) return aliases.get(init.text)
  if (!ts.isPropertyAccessExpression(init) || !ts.isIdentifier(init.expression))
    return undefined
  const whole = aliases.get(init.expression.text)
  return whole !== undefined && whole.prop === undefined
    ? { slot: whole.slot, prop: init.name.text }
    : undefined
}

/** What `useWorkspaceX(params)` does with `params` while the call runs. */
function eagerParamsOf(
  hook: string,
  file: string,
  fn: FunctionNode,
  ast: ts.SourceFile,
): EagerParams {
  const lineOf = (n: ts.Node) =>
    ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1
  const out: EagerParams = { hook, file, uses: new Map() }
  const useOf = (key: string): ParamUse => {
    let use = out.uses.get(key)
    if (use === undefined) {
      use = { memberRead: new Map(), memberUsed: new Map() }
      out.uses.set(key, use)
    }
    return use
  }
  const once = (into: Map<string, number>, key: string, line: number) => {
    if (!into.has(key)) into.set(key, line)
  }

  /** `ref` evaluates to the parameter `key`, inside the eager region. */
  const note = (key: string, ref: ts.Node) => {
    const use = useOf(key)
    const line = lineOf(ref)
    use.read ??= line
    const { child, parent } = usingParent(ref)
    if (ts.isCallExpression(parent) && parent.expression === child) {
      use.called ??= line
    } else if (
      ts.isElementAccessExpression(parent) &&
      parent.expression === child
    ) {
      use.called ??= line
    } else if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === child
    ) {
      once(use.memberRead, parent.name.text, line)
      if (isInvokedOrDereferenced(parent)) {
        once(use.memberUsed, parent.name.text, line)
      }
    }
  }

  const aliases = new Map<string, ParamAlias>()
  const destructure = (
    pattern: ts.ObjectBindingPattern,
    slot: number,
    at: ts.Node,
  ) => {
    for (const element of pattern.elements) {
      if (!ts.isIdentifier(element.name)) continue
      const prop = propertyNameText(element.propertyName) ?? element.name.text
      aliases.set(element.name.text, { slot, prop })
      useOf(`${slot}:${prop}`).read ??= lineOf(at)
    }
  }

  fn.parameters.forEach((parameter, slot) => {
    if (ts.isIdentifier(parameter.name)) {
      aliases.set(parameter.name.text, { slot })
    } else if (ts.isObjectBindingPattern(parameter.name)) {
      destructure(parameter.name, slot, parameter)
    }
  })

  const body = fn.body
  if (body === undefined) return out

  // Aliases and local functions the hook body declares at its top level.
  const locals = new Map<string, ts.Node>()
  if (ts.isBlock(body)) {
    for (const statement of body.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        if (statement.body) locals.set(statement.name.text, statement.body)
        continue
      }
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer && unwrap(declaration.initializer)
        if (init === undefined) continue
        if (
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
          ts.isIdentifier(declaration.name)
        ) {
          locals.set(declaration.name.text, init.body)
          continue
        }
        const source = aliasSource(init, aliases)
        if (source === undefined) continue
        if (ts.isIdentifier(declaration.name)) {
          aliases.set(declaration.name.text, source)
        } else if (
          ts.isObjectBindingPattern(declaration.name) &&
          source.prop === undefined
        ) {
          destructure(declaration.name, source.slot, declaration)
        }
      }
    }
  }

  const queue: ts.Node[] = [body]
  const queued = new Set<ts.Node>([body])
  const visit = (n: ts.Node) => {
    if (isFunctionNode(n) && !runsImmediately(n)) return
    if (ts.isIdentifier(n) && !isNamePosition(n)) {
      const alias = aliases.get(n.text)
      if (alias?.prop !== undefined) {
        note(`${alias.slot}:${alias.prop}`, n)
      } else if (alias !== undefined) {
        const { child, parent } = usingParent(n)
        if (
          ts.isPropertyAccessExpression(parent) &&
          parent.expression === child
        ) {
          note(`${alias.slot}:${parent.name.text}`, parent)
        } else if (isInvokedOrDereferenced(n)) {
          note(`${alias.slot}:`, n)
        }
      }
      const local = locals.get(n.text)
      if (
        local !== undefined &&
        !queued.has(local) &&
        ts.isCallExpression(n.parent) &&
        n.parent.expression === n
      ) {
        queued.add(local)
        queue.push(local)
      }
    }
    ts.forEachChild(n, visit)
  }
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (ts.isBlock(next)) ts.forEachChild(next, visit)
    else visit(next)
  }
  return out
}

/** Top-level `useWorkspace*` functions a file defines. */
function hookDefinitions(
  ast: ts.SourceFile,
): { name: string; fn: FunctionNode }[] {
  const found: { name: string; fn: FunctionNode }[] = []
  for (const statement of ast.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      HOOK_NAME.test(statement.name.text)
    ) {
      found.push({ name: statement.name.text, fn: statement })
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer && unwrap(declaration.initializer)
        if (
          ts.isIdentifier(declaration.name) &&
          HOOK_NAME.test(declaration.name.text) &&
          init !== undefined &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          found.push({ name: declaration.name.text, fn: init })
        }
      }
    }
  }
  return found
}

type Declaration = {
  statement: ts.Statement
  /** Index into the enclosing statement lists, innermost first. */
  depth: number
  /** A function or object literal the name is bound to, to follow into. */
  body?: ts.Node
  temporalDeadZone: boolean
}

/** The innermost declaration of `name` visible from the call's scopes. */
function resolveDeclaration(
  name: string,
  lists: ts.NodeArray<ts.Statement>[],
): Declaration | undefined {
  for (let depth = 0; depth < lists.length; depth++) {
    for (const statement of lists[depth]!) {
      if (
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === name
      ) {
        return {
          statement,
          depth,
          body: statement.body,
          temporalDeadZone: false,
        }
      }
      if (ts.isClassDeclaration(statement) && statement.name?.text === name) {
        return { statement, depth, temporalDeadZone: true }
      }
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        const names = new Set<string>()
        bindingNames(declaration.name, names)
        if (!names.has(name)) continue
        const init = declaration.initializer && unwrap(declaration.initializer)
        const body =
          init !== undefined &&
          ts.isIdentifier(declaration.name) &&
          (ts.isArrowFunction(init) ||
            ts.isFunctionExpression(init) ||
            ts.isObjectLiteralExpression(init))
            ? init
            : undefined
        return {
          statement,
          depth,
          body,
          temporalDeadZone: isTemporalDeadZone(statement),
        }
      }
    }
  }
  return undefined
}

type HookOffender = {
  file: string
  hook: string
  /** The parameter, or `param.member`, whose argument runs. */
  param: string
  hookFile: string
  runsAtLine: number
  callAtLine: number
  readName: string
  declaredAtLine: number
  via: string[]
}

/**
 * Every hook call in `ast` where the part of an argument the hook runs while
 * it runs reaches a binding still in its temporal dead zone at the call.
 */
function scanHookCalls(
  file: string,
  ast: ts.SourceFile,
  hooks: ReadonlyMap<string, EagerParams>,
): HookOffender[] {
  const offenders: HookOffender[] = []
  const lineOf = (n: ts.Node) =>
    ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1

  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const params = hooks.get(node.expression.text)
      if (params !== undefined) judgeCall(node, params)
    }
    ts.forEachChild(node, walk)
  }

  function judgeCall(call: ts.CallExpression, params: EagerParams) {
    const lists = enclosingStatementLists(call)

    /** `runs` executes at the call: report what it reaches that is late. */
    const reach = (runs: ts.Node, param: string, runsAtLine: number) => {
      const visited = new Set<ts.Node>()
      const follow = (node: ts.Node, via: string[]) => {
        const reads = ts.isIdentifier(node)
          ? new Set([node.text])
          : readNames(node)
        for (const name of reads) {
          const declaration = resolveDeclaration(name, lists)
          if (declaration === undefined) continue
          const { statement } = declaration
          const later = statement.getStart(ast) > call.getStart(ast)
          const makesTheCall =
            declaration.depth === 0 &&
            statement.getStart(ast) <= call.getStart(ast) &&
            statement.getEnd() >= call.getEnd()
          if (declaration.temporalDeadZone && (later || makesTheCall)) {
            offenders.push({
              file,
              hook: params.hook,
              param,
              hookFile: params.file,
              runsAtLine,
              callAtLine: lineOf(call),
              readName: name,
              declaredAtLine: lineOf(statement),
              via,
            })
          } else if (
            declaration.body !== undefined &&
            !visited.has(declaration.body)
          ) {
            visited.add(declaration.body)
            follow(declaration.body, [...via, name])
          }
        }
      }
      follow(runs, [])
    }

    /** `value`, or the object literal a `const` of the caller binds it to. */
    const literalOf = (
      value: ts.Node,
    ): ts.ObjectLiteralExpression | undefined => {
      const v = ts.isExpression(value) ? unwrap(value) : value
      if (ts.isObjectLiteralExpression(v)) return v
      if (!ts.isIdentifier(v)) return undefined
      const body = resolveDeclaration(v.text, lists)?.body
      return body !== undefined && ts.isObjectLiteralExpression(body)
        ? body
        : undefined
    }

    /**
     * Judge an object argument member by member. `read` and `used` say which
     * members the hook reads and runs, keyed by member name.
     */
    const judgeObject = (
      literal: ts.ObjectLiteralExpression,
      label: (member: string) => string,
      read: ReadonlyMap<string, number>,
      used: ReadonlyMap<string, number>,
      /** How to judge a plain member value the hook runs, by name. */
      judgeValue: (member: string, value: ts.Node, line: number) => void,
    ) => {
      for (const property of literal.properties) {
        if (ts.isSpreadAssignment(property)) {
          const first = [...used.values()][0]
          if (first !== undefined) {
            reach(property.expression, label('...'), first)
          }
          continue
        }
        const member = propertyNameText(property.name)
        if (member === undefined) continue
        if (ts.isGetAccessorDeclaration(property)) {
          const line = read.get(member) ?? used.get(member)
          if (line !== undefined && property.body) {
            reach(property.body, label(member), line)
          }
          continue
        }
        if (ts.isPropertyAssignment(property)) {
          judgeValue(member, property.initializer, 0)
        } else if (ts.isShorthandPropertyAssignment(property)) {
          judgeValue(member, property.name, 0)
        } else if (ts.isMethodDeclaration(property) && property.body) {
          const line = used.get(member)
          if (line !== undefined) reach(property.body, label(member), line)
        }
      }
    }

    /** The argument for one parameter, given what the hook does with it. */
    const judgeParam = (param: string, value: ts.Node, use: ParamUse) => {
      if (use.called !== undefined) {
        reach(value, param, use.called)
        return
      }
      if (use.memberRead.size === 0 && use.memberUsed.size === 0) return
      const literal = literalOf(value)
      if (literal === undefined) {
        const first = [...use.memberUsed.values()][0]
        if (first !== undefined) reach(value, param, first)
        return
      }
      judgeObject(
        literal,
        (member) => `${param}.${member}`,
        use.memberRead,
        use.memberUsed,
        (member, memberValue) => {
          const line = use.memberUsed.get(member)
          if (line !== undefined) {
            reach(memberValue, `${param}.${member}`, line)
          }
        },
      )
    }

    call.arguments.forEach((raw, slot) => {
      const self = params.uses.get(`${slot}:`)
      if (self?.called !== undefined) {
        reach(raw, `argument ${slot + 1}`, self.called)
        return
      }
      const props = new Map(
        [...params.uses]
          .filter(([key]) => key.startsWith(`${slot}:`) && key !== `${slot}:`)
          .map(([key, use]) => [key.slice(key.indexOf(':') + 1), use]),
      )
      if (props.size === 0) return
      const literal = literalOf(raw)
      if (literal === undefined) {
        // An opaque argument: follow it whole if anything in it runs.
        for (const [prop, use] of props) {
          const line = use.called ?? [...use.memberUsed.values()][0]
          if (line !== undefined) reach(raw, prop, line)
        }
        return
      }
      const read = new Map<string, number>()
      const used = new Map<string, number>()
      for (const [prop, use] of props) {
        if (use.read !== undefined) read.set(prop, use.read)
        const line = use.called ?? [...use.memberUsed.values()][0]
        if (line !== undefined) used.set(prop, line)
      }
      judgeObject(
        literal,
        (prop) => prop,
        read,
        used,
        (prop, value) => {
          const use = props.get(prop)
          if (use !== undefined) judgeParam(prop, value, use)
        },
      )
    })
  }

  walk(ast)
  return offenders
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

/** Hooks and what each runs of its parameters, from any number of files. */
function eagerHookTable(
  files: readonly { file: string; ast: ts.SourceFile }[],
): Map<string, EagerParams> {
  const table = new Map<string, EagerParams>()
  for (const { file, ast } of files) {
    for (const { name, fn } of hookDefinitions(ast)) {
      table.set(name, eagerParamsOf(name, file, fn, ast))
    }
  }
  return table
}

function describeHookOffender(o: HookOffender, rel: (f: string) => string) {
  const via = o.via.length > 0 ? ` through ${o.via.join(' -> ')}` : ''
  return (
    `${rel(o.file)}:${o.callAtLine}: ${o.hook} runs '${o.param}' while it ` +
    `runs (${rel(o.hookFile)}:${o.runsAtLine}), and that argument reaches ` +
    `'${o.readName}'${via}, declared at ${rel(o.file)}:${o.declaredAtLine}`
  )
}

describe('hook arguments run while the hook runs', () => {
  const parsed = sourceFiles(SRC).map((file) => ({
    file,
    ast: parse(file, readFileSync(file, 'utf8')),
  }))
  const hooks = eagerHookTable(parsed)

  it('finds the hooks it is meant to police, and a call for each', () => {
    // A rename that hides the hooks from the scan must not turn this green
    // by finding nothing to check.
    expect(hooks.size).toBeGreaterThanOrEqual(14)
    expect(
      [...hooks.keys()].filter((h) => h.startsWith('createWorkspace')).sort(),
    ).toEqual(
      expect.arrayContaining([
        'createWorkspaceExportStore',
        'createWorkspaceLayoutStore',
        'createWorkspaceSelectionStore',
      ]),
    )
    const called = new Set<string>()
    for (const { ast } of parsed) {
      const walk = (n: ts.Node) => {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          hooks.has(n.expression.text)
        ) {
          called.add(n.expression.text)
        }
        ts.forEachChild(n, walk)
      }
      walk(ast)
    }
    expect([...hooks.keys()].filter((h) => !called.has(h))).toEqual([])
  })

  it('reach no binding declared later at the call site', () => {
    const offenders = parsed.flatMap(({ file, ast }) =>
      scanHookCalls(file, ast, hooks).map((o) =>
        describeHookOffender(o, (f) => relative(SRC, f)),
      ),
    )
    // Move the hook call below what its argument reads, or stop the hook
    // running that parameter while it runs. Do not guard the read behind a
    // `&&`: that is how #98 hid for months.
    expect(offenders).toEqual([])
  })
})

describe('the hook-boundary scan itself', () => {
  const run = (hookSource: string, callerSource: string) => {
    const hooks = eagerHookTable([
      { file: 'hook.ts', ast: parse('hook.ts', hookSource) },
    ])
    return scanHookCalls('caller.tsx', parse('caller.tsx', callerSource), hooks)
      .map(
        (o) =>
          `${o.param}->${o.readName}${o.via.length > 0 ? `@${o.via.join('>')}` : ''}`,
      )
      .sort()
  }
  const caller = `
    export function Workspace() {
      const early = () => 1
      const readLate = () => late()
      const result = useWorkspaceProbe({
        driving: () => late(),
        indirect: readLate,
        lazy: () => late(),
        get getter() { return late() },
        plain: early,
        timeline: { now: () => late(), later: () => late() },
      })
      const late = createSignal(0)[0]
      return result
    }`

  it('treats a createWorkspace*Store factory as a hook, and nothing else named create*', () => {
    const store = (name: string) => `
      export function ${name}(probe: () => number) {
        const memo = createMemo(() => probe())
        return { memo }
      }`
    const call = (name: string) => `
      export function Workspace() {
        const store = ${name}(() => late())
        const late = () => 1
        return store
      }`
    const scanWith = (name: string) =>
      scanHookCalls(
        'caller.tsx',
        parse('caller.tsx', call(name)),
        eagerHookTable([
          { file: 'store.ts', ast: parse('store.ts', store(name)) },
        ]),
      ).map((o) => `${o.hook}:${o.param}->${o.readName}`)
    expect(scanWith('createWorkspaceProbeStore')).toEqual([
      'createWorkspaceProbeStore:argument 1->late',
    ])
    // Only the store factories: a `createWorkspace*` that is not a store, and
    // a store outside the workspace family, stay out of the table.
    expect(scanWith('createWorkspaceHandoff')).toEqual([])
    expect(scanWith('createConsoleStore')).toEqual([])
  })

  it('flags the #98 pattern: an eager memo in the hook, the late read at the call site', () => {
    const hook = `
      export function useWorkspaceProbe(params: Params) {
        const memo = createMemo(() => blended() && params.driving())
        return { memo, later: () => params.lazy() }
      }`
    expect(run(hook, caller)).toEqual(['driving->late'])
  })

  it('follows destructuring, local functions, members and one caller const', () => {
    const hook = `
      export function useWorkspaceProbe(params: Params) {
        const { indirect, lazy, getter, timeline } = params
        function setUp() { untrack(() => indirect()) }
        setUp()
        const frame = timeline.now()
        const onClick = () => lazy() + timeline.later()
        return { onClick, getter, frame }
      }`
    // The destructuring reads `getter`, which runs it. Only the member of
    // `timeline` that runs is judged, not its sibling.
    expect(run(hook, caller)).toEqual([
      'getter->late',
      'indirect->late@readLate',
      'timeline.now->late',
    ])
  })

  it('stays quiet about effects, handlers, member reads and early bindings', () => {
    const hook = `
      export function useWorkspaceProbe(params: Params) {
        createEffect(() => params.driving())
        onMount(() => params.indirect())
        const handler = () => params.lazy()
        const value = createMemo(() => params.plain())
        const keep = params.timeline.later
        return { handler, value, keep }
      }`
    expect(run(hook, caller)).toEqual([])
  })
})

describe('the eager primitives the scans know', () => {
  const late = (lines: string) => `
    export function Workspace() {
${lines}
      const late = () => 1
      return null
    }`

  it('include createResource: its source and fetcher run at creation', () => {
    // solid-js 1.9.11: a function source becomes a createMemo, and load(false)
    // calls the fetcher on the spot unless the source value is null or false.
    const offenders = scan(
      'resource.tsx',
      late(`
      const [one] = createResource(() => late())
      const [two] = createResource(() => 'key', (key) => key + late())
      const [three] = createResource(() => late(), (key) => key)
      const [four] = createResource(() => late(), () => late())`),
    ).map((o) => `${o.computation}@${o.usedAtLine}:${o.readName}`)
    // One entry per call and binding, however many of its arguments read it.
    expect(offenders).toEqual([
      'createResource@4:late',
      'createResource@5:late',
      'createResource@6:late',
      'createResource@7:late',
    ])
  })

  it('include createResource across the hook boundary', () => {
    const hooks = eagerHookTable([
      {
        file: 'hook.ts',
        ast: parse(
          'hook.ts',
          `export function useWorkspaceProbe(params: Params) {
            const [data] = createResource(() => params.load())
            return data
          }`,
        ),
      },
    ])
    const offenders = scanHookCalls(
      'caller.tsx',
      parse(
        'caller.tsx',
        `export function Workspace() {
          const data = useWorkspaceProbe({ load: () => late() })
          const late = () => 1
          return data
        }`,
      ),
      hooks,
    ).map((o) => `${o.param}->${o.readName}`)
    expect(offenders).toEqual(['load->late'])
  })
})
