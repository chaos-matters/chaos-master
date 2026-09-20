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
 */
const EAGER = new Set([
  'createMemo',
  'createComputed',
  'createRenderEffect',
  'createDeferred',
  'createSelector',
])

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
      const callback = node.arguments[0]
      if (
        EAGER.has(primitive) &&
        callback !== undefined &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      ) {
        const reads = readNames(callback)
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
