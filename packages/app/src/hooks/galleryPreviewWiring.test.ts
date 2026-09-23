/**
 * MainWorkspace wires the gallery's hover preview into the three places that
 * must see past it.
 *
 * The preview is written into the document silently, and the hook that owns
 * it can take it off (useWorkspaceBlendPick), but only if the workspace asks
 * at the right moments. Mounting MainWorkspace in Vitest mounts the WebGPU
 * renderer too, so this reads its source instead, the way the recorder's UI
 * coverage ratchet does, and the behaviour behind each wire is tested
 * against a world wired the same way (useWorkspaceBlendPick.test.tsx,
 * useWorkspaceAutosave.test.ts):
 *
 * - before every undo and redo, so time travel is computed against the
 *   document its entry describes, not the document with a hover in it;
 * - in every autosave, which stores the document without the preview;
 * - when a breed pick opens the breed gallery, which reads parent A from the
 *   document and must find no blend a quick switch left in it;
 * - before every export, share and scripted render, which capture the canvas
 *   or snapshot the document, so the preview ends first and the pixels, the
 *   flame they carry and Recents agree (quickExport.test.tsx,
 *   lazyModals.shareLink.test.ts), and before a take starts, which records
 *   the document as its first state;
 * - in Save for Later and the 2D/3D stash, which store the document and read
 *   it without the preview.
 */
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SOURCE = import.meta.glob('../MainWorkspace.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
})['../MainWorkspace.tsx'] as string

const ast = ts.createSourceFile(
  'MainWorkspace.tsx',
  SOURCE,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)

const compact = (node: ts.Node) => node.getText(ast).replace(/\s+/g, ' ').trim()

function callsTo(name: string): ts.CallExpression[] {
  const calls: ts.CallExpression[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    ) {
      calls.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return calls
}

/** The initializer of `property` in the object literal passed to `name`. */
function optionOf(name: string, property: string): string {
  const calls = callsTo(name)
  expect(calls, `expected one call to ${name}`).toHaveLength(1)
  for (const arg of calls[0]!.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue
    for (const prop of arg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === property
      ) {
        return compact(prop.initializer)
      }
    }
  }
  return ''
}

/** The arguments of the one call to `name`, compacted. */
function argumentsOf(name: string): string[] {
  const calls = callsTo(name)
  expect(calls, `expected one call to ${name}`).toHaveLength(1)
  return calls[0]!.arguments.map(compact)
}

/** The statements of the one function named `name`: declared, or assigned
 *  to a variable or an object property of that name. */
function statementsOf(name: string): string[] {
  const bodies: ts.Block[] = []
  const visit = (node: ts.Node) => {
    let fn: ts.Node | undefined
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) fn = node
    if (
      (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      fn = node.initializer
    }
    if (
      fn &&
      (ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn)) &&
      fn.body &&
      ts.isBlock(fn.body)
    ) {
      bodies.push(fn.body)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  expect(bodies, `expected one function named ${name}`).toHaveLength(1)
  return bodies[0]!.statements.map(compact)
}

/** What each assignment to `name` assigns. */
function assignmentsTo(name: string): string[] {
  const values: string[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === name
    ) {
      values.push(compact(node.right))
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return values
}

function jsxAttribute(tag: string, attribute: string): string {
  const values: string[] = []
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(ast) === tag
    ) {
      for (const attr of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attr) &&
          attr.name.getText(ast) === attribute &&
          attr.initializer
        ) {
          values.push(compact(attr.initializer))
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  expect(values, `expected one ${tag} with ${attribute}`).toHaveLength(1)
  return values[0]!
}

describe('the gallery hover preview in MainWorkspace', () => {
  it('comes off before every undo and redo', () => {
    expect(optionOf('createStoreHistory', 'onBeforeTimeTravel')).toContain(
      'blendPick.end()',
    )
  })

  it('stays out of every autosave', () => {
    expect(optionOf('useWorkspaceAutosave', 'savedFlame')).toBe(
      'blendPick.withoutPreview',
    )
  })

  it('is what the badge over the canvas names, not the tile under the pointer', () => {
    expect(jsxAttribute('CanvasViewport', 'hoveredBlendName')).toBe(
      '{blendPick.badge}',
    )
  })

  it('comes off, both halves of it, before a breed pick reads parent A', () => {
    expect(jsxAttribute('WorkspaceSidebar', 'endBreedPreview')).toBe(
      '{blendPick.end}',
    )
  })

  it('comes off before the export dialog or a flash export reads the canvas', () => {
    expect(argumentsOf('createExportPngDialog').at(-1)).toBe('blendPick.end')
  })

  it('comes off before the share link modal reads the document', () => {
    expect(argumentsOf('createLazyShareLinkModal')).toContain('blendPick.end')
  })

  it('comes off before a Discord share freezes the document', () => {
    expect(statementsOf('shareToDiscord')[0]).toBe('blendPick.end()')
  })

  it('comes off before a take starts, from the dock or from the Arcade', () => {
    expect(statementsOf('captureRecorderStartExtras')[0]).toBe(
      'blendPick.end()',
    )
    // The dock's Record button captures them before it starts
    // (SessionRecorderControls.test.tsx)...
    expect(
      jsxAttribute('WorkspaceBottomBar', 'captureRecorderStartExtras'),
    ).toBe('{captureRecorderStartExtras}')
    // ...and `ctx.recorder.start`, where every Arcade take starts (Teach,
    // Cinema, Beats and a duel's player seat), before it reads the document.
    expect(argumentsOf('startSessionRecording')).toEqual([
      'flameDescriptor',
      'captureRecorderStartExtras()',
      'now',
    ])
  })

  it('comes off before a scripted render snapshots the document', () => {
    expect(statementsOf('renderImage')[0]).toBe('blendPick.end()')
    expect(statementsOf('renderAnimation')[0]).toBe('blendPick.end()')
  })

  it('stays out of Save for Later, which the autosave hook makes', () => {
    // Every Recents write from here goes through useWorkspaceAutosave, which
    // stores `savedFlame` (useWorkspaceAutosave.test.ts).
    expect(callsTo('saveRecentFlame').map(compact)).toEqual([])
  })

  it('stays out of the flame a 2D/3D switch puts aside', () => {
    const stashed = [
      ...assignmentsTo('stashedFlame2D'),
      ...assignmentsTo('stashedFlame3D'),
    ]
    expect(stashed).toEqual([
      'deepClone(blendPick.withoutPreview())',
      'deepClone(blendPick.withoutPreview())',
    ])
  })
})
