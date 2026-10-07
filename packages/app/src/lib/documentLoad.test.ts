import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import loadFlameModalSource from '@/components/LoadFlameModal/LoadFlameModal.tsx?raw'
import { parseFlameXml } from '@/flame/flameXml'
import { useWorkspaceAutosave } from '@/hooks/useWorkspaceAutosave'
import workspaceSource from '@/MainWorkspace.tsx?raw'
import { clearRecentFlames, loadRecentFlames, loadRecentFlamesForRewrite, MAX_RECENT_FLAMES, } from '@/utils/recentFlames'
import { useAppDragAndDrop } from '@/utils/useAppDragAndDrop'
import dragAndDropSource from '@/utils/useAppDragAndDrop.ts?raw'
import { replaceOpenDocument } from './documentLoad'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// Same reason as pauseSave.test.ts: localStorage is not usable in this runtime,
// so Recents round-trips through an in-memory store.
const { loadFlameFromFileMock } = vi.hoisted(() => ({
  loadFlameFromFileMock: vi.fn(),
}))

vi.mock('@/utils/useLoadFlameFromFile', () => ({
  useLoadFlameFromFile: () => loadFlameFromFileMock,
}))

const store = new Map<string, string>()
/** Quota, private mode, a locked-down WebView: storage that says no. */
let storageRefuses = false
vi.mock('@/utils/storage', () => ({
  safeGetItem: (key: string) => store.get(key) ?? null,
  safeSetItem: (key: string, value: string) => {
    if (storageRefuses) return false
    store.set(key, value)
    return true
  },
  safeRemoveItem: (key: string) => {
    store.delete(key)
  },
}))

const parsed = parseFlameXml(`<?xml version="1.0" encoding="UTF-8"?>
<flame name="Open" version="Apophysis 7X" size="800 600"
       center="0 0" scale="200" oversample="1" filter="0.5"
       quality="100" background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
</flame>`)
const flame: FlameDescriptor = {
  ...parsed,
  metadata: { ...parsed.metadata, name: 'Open' },
}

afterEach(() => {
  storageRefuses = false
  clearRecentFlames()
})

/** A shelf with no room left on it, written structurally so the cap is
 *  reached without 150 schema passes. `kept-149` is the oldest, and so the
 *  one a forced save spends. */
const fillRecents = () => {
  store.set(
    'chaos-master-recent-flames',
    JSON.stringify(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, index) => ({
        id: `kept-${index}`,
        name: `Kept ${index}`,
        savedAt: 1000 + index,
        flame,
      })),
    ),
  )
}

/** The answer these tests give when a save at the cap asks whether it may
 *  evict the oldest kept flame. No, unless a test says otherwise: an
 *  unanswered prompt would leave the boundary flush pending forever, and a
 *  yes would quietly let a write past the guard the flush is there to
 *  respect. */
const declineOverwrite = () => Promise.resolve(false)

/** The answer these tests give when a replacement asks whether the open flame
 *  may be dropped because storage refused to save it. No: keeping the work is
 *  the default everywhere, and a test that wants the other answer says so. */
const keepUnsaved = () => Promise.resolve(false)

/** The name a call is calling, whether it is written bare or reached through
 *  the object it was returned in. A guard that only knew the bare form was
 *  disarmed by `autosave.flushDirtyToRecents()`. */
const calleeName = (node: ts.CallExpression): string | undefined => {
  if (ts.isIdentifier(node.expression)) return node.expression.text
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text
  }
  return undefined
}

/** Whether this property of an object literal is the one called `name`. */
const named = (property: ts.ObjectLiteralElementLike, name: string) =>
  property.name !== undefined &&
  ts.isIdentifier(property.name) &&
  property.name.text === name

const isFunctionLike = (node: ts.Node): boolean =>
  ts.isArrowFunction(node) ||
  ts.isFunctionExpression(node) ||
  ts.isFunctionDeclaration(node) ||
  ts.isMethodDeclaration(node)

/**
 * The nearest function a node is written inside.
 *
 * Nearest, and not any enclosing one: MainWorkspace's own body holds
 * several settled replacements, so a guard that accepted a gate from any
 * ancestor scope would call every call site in the file settled forever -
 * which is the shape of guard that reads as coverage and is none.
 */
const enclosingFunction = (node: ts.Node): ts.Node => {
  let scope: ts.Node = node
  while (scope.parent !== undefined && !isFunctionLike(scope)) {
    scope = scope.parent
  }
  return scope
}

/** Whether `name` is written anywhere inside this node. */
const mentions = (node: ts.Node, name: string): boolean => {
  let found = false
  const visit = (child: ts.Node) => {
    if (found) return
    if (ts.isIdentifier(child) && child.text === name) found = true
    else ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

/** Whether `name` is called inside this node, before `position`. */
const callsBefore = (
  scope: ts.Node,
  name: string,
  position: number,
  ast: ts.SourceFile,
): boolean => {
  let found = false
  const visit = (child: ts.Node) => {
    if (found) return
    if (
      ts.isCallExpression(child) &&
      calleeName(child) === name &&
      child.getStart(ast) < position
    ) {
      found = true
      return
    }
    ts.forEachChild(child, visit)
  }
  visit(scope)
  return found
}

/** Whether this statement leaves the function it is in. */
const containsReturn = (node: ts.Node): boolean => {
  let found = false
  const visit = (child: ts.Node) => {
    if (found) return
    if (ts.isReturnStatement(child)) found = true
    else ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

/** The workspace source, parsed once per guard that walks it. */
const parseWorkspace = () =>
  ts.createSourceFile(
    'MainWorkspace.tsx',
    workspaceSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

/** Every file that seeds the workspace's animation loader. */
const seeding: Array<[string, string]> = [
  ['MainWorkspace.tsx', workspaceSource],
  ['LoadFlameModal.tsx', loadFlameModalSource],
  ['useAppDragAndDrop.ts', dragAndDropSource],
]

describe('replacing the open document', () => {
  it('puts the outgoing flame in Recents before the incoming one lands', () => {
    // The Library chokepoint, with the editor's own autosave doing the
    // flushing. Every way into the load dialog reaches this order; the
    // desktop's Load button once had it and the touch layouts' way in did
    // not, so opening a flame on a phone dropped whatever was unsaved.
    createRoot((dispose) => {
      const [open, setOpen] = createStore<FlameDescriptor>(
        JSON.parse(JSON.stringify(flame)),
      )
      const autosave = useWorkspaceAutosave({
        flameDescriptor: open,
        getTracks: () => [],
        getConfig: () => undefined,
        agentDriving: () => false,
        confirmOverwriteOldest: declineOverwrite,
        confirmDiscardUnsaved: keepUnsaved,
        showToast: () => 0,
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')
      expect(autosave.isFlameDirty()).toBe(true)

      replaceOpenDocument({
        flushUnsaved: autosave.flushDirtyToRecents,
        replace: () => {
          setOpen('metadata', 'name', 'Opened from Library')
        },
      })

      // What reached Recents is what was being edited, not what replaced it.
      const recents = loadRecentFlames()
      expect(recents).toHaveLength(1)
      expect(recents[0]?.flame.metadata?.name).toBe('Unsaved work')
      dispose()
    })
  })

  it('is where every replacement in the workspace flushes', () => {
    // The claim this module makes about itself, checked rather than
    // asserted: a replacement that flushes by hand is one edit away from
    // flushing after the replacement, or not at all, which is the bug that
    // put this module here. Passing the flush to the chokepoint as a value
    // is the only form allowed; a call of its own is what this catches.
    //
    // Property access counts. Matching bare identifiers alone meant
    // `autosave.flushDirtyToRecents()` - the shape this hook is returned in
    // - slipped straight past, so the guard could be disarmed by a rename
    // nobody would think twice about.
    const ast = parseWorkspace()
    const byHand: string[] = []
    const walk = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        calleeName(node) === 'flushDirtyToRecents'
      ) {
        const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast))
        byHand.push(`MainWorkspace.tsx:${line + 1}`)
      }
      ts.forEachChild(node, walk)
    }
    walk(ast)
    expect(byHand).toEqual([])
  })

  it('gives a replacement with no animation a timeline of its own', () => {
    // The timeline is part of the document: the frame rate, the end frame and
    // the loop mode. The effect that consumes a load applies the config it is
    // handed, and a load that hands none leaves whatever the document before
    // it was running at - so New Flame, which carries no animation at all,
    // opened the starter flame at the last flame's 60fps over 300 frames. The
    // hand-off path is not in this: it resets the timeline itself before
    // seeding, and it passes the seeded config through.
    //
    // Every file that seeds a load, not just the workspace. Scanning
    // MainWorkspace alone left the Library's own plain-flame load and a
    // dropped file green while both handed over empty tracks and no
    // timeline, which is the exact shape this exists to catch.
    const inherited: string[] = []
    for (const [fileName, source] of seeding) {
      const ast = ts.createSourceFile(
        fileName,
        source,
        ts.ScriptTarget.Latest,
        true,
        fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      const walk = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          calleeName(node) === 'setLoadedAnimation' &&
          node.arguments[0] !== undefined &&
          ts.isObjectLiteralExpression(node.arguments[0])
        ) {
          const seed = node.arguments[0]
          const carriesNoTracks = seed.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              named(property, 'tracks') &&
              ts.isArrayLiteralExpression(property.initializer) &&
              property.initializer.elements.length === 0,
          )
          const saysTimeline = seed.properties.some((property) =>
            named(property, 'config'),
          )
          if (carriesNoTracks && !saysTimeline) {
            const { line } = ast.getLineAndCharacterOfPosition(
              node.getStart(ast),
            )
            inherited.push(`${fileName}:${line + 1}`)
          }
        }
        ts.forEachChild(node, walk)
      }
      walk(ast)
    }
    expect(inherited).toEqual([])
  })

  it('asks before a replacement at the cap, and saves on a yes', async () => {
    // The flush here is the ONLY thing that saves the outgoing document, so
    // at the cap the two things that could give way are both the user's: the
    // flame on screen, unsaved, or the oldest one they kept. Declining in
    // silence picked the first and destroyed it, with the toast explaining it
    // painting after the document was already gone.
    fillRecents()
    let asked = 0
    await createRoot(async (dispose) => {
      const [open, setOpen] = createStore<FlameDescriptor>(
        JSON.parse(JSON.stringify(flame)),
      )
      const autosave = useWorkspaceAutosave({
        flameDescriptor: open,
        getTracks: () => [],
        getConfig: () => undefined,
        agentDriving: () => false,
        showToast: () => 0,
        confirmDiscardUnsaved: keepUnsaved,
        confirmOverwriteOldest: () => {
          asked += 1
          return Promise.resolve(true)
        },
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      expect(await autosave.prepareDocumentReplacement()).toBe(true)
      expect(asked).toBe(1)
      const replaced = replaceOpenDocument({
        flushUnsaved: autosave.flushDirtyToRecents,
        replace: () => {
          setOpen('metadata', 'name', 'Opened from Library')
        },
      })

      expect(replaced).toBe(true)
      expect(open.metadata?.name).toBe('Opened from Library')
      const kept = loadRecentFlamesForRewrite()
      expect(kept).toHaveLength(MAX_RECENT_FLAMES)
      expect(kept[0]?.flame.metadata?.name).toBe('Unsaved work')
      // The oldest kept flame is what paid for the room.
      expect(kept.some((entry) => entry.id === 'kept-149')).toBe(false)
      dispose()
    })
  })

  it('keeps the open document, and Recents, when the answer is no', async () => {
    // A no is not a reason to go ahead anyway. The work stays on screen,
    // where the user can still save it themselves - and the shelf they said
    // not to touch is exactly as it was.
    fillRecents()
    const toasts: string[] = []
    await createRoot(async (dispose) => {
      const [open, setOpen] = createStore<FlameDescriptor>(
        JSON.parse(JSON.stringify(flame)),
      )
      const autosave = useWorkspaceAutosave({
        flameDescriptor: open,
        getTracks: () => [],
        getConfig: () => undefined,
        agentDriving: () => false,
        showToast: (message) => toasts.push(message),
        confirmOverwriteOldest: declineOverwrite,
        confirmDiscardUnsaved: keepUnsaved,
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      expect(await autosave.prepareDocumentReplacement()).toBe(false)

      // The caller stops here; nothing replaced the document.
      expect(open.metadata?.name).toBe('Unsaved work')
      expect(autosave.isFlameDirty()).toBe(true)
      const kept = loadRecentFlamesForRewrite()
      expect(kept).toHaveLength(MAX_RECENT_FLAMES)
      expect(kept.some((entry) => entry.id === 'kept-149')).toBe(true)
      expect(
        kept.some((entry) => entry.flame.metadata?.name === 'Unsaved work'),
      ).toBe(false)
      // A tap on Library that appears to do nothing is the one outcome
      // nobody can report.
      expect(toasts.join(' ')).toContain('Kept the open flame')
      dispose()
    })
  })

  it('refuses to replace when storage refused the flush', () => {
    // `refused` was tested for nowhere: the chokepoint asked only whether the
    // outcome was `full`, so a storage refusal read exactly like a save and
    // the replacement went ahead over the outgoing flame and its keyframe
    // tracks, with no message at all. A write that did not land is a write
    // that did not land, whichever reason it gives.
    createRoot((dispose) => {
      const [open, setOpen] = createStore<FlameDescriptor>(
        JSON.parse(JSON.stringify(flame)),
      )
      const autosave = useWorkspaceAutosave({
        flameDescriptor: open,
        getTracks: () => [],
        getConfig: () => undefined,
        agentDriving: () => false,
        showToast: () => 0,
        confirmOverwriteOldest: declineOverwrite,
        confirmDiscardUnsaved: keepUnsaved,
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')
      storageRefuses = true

      const replaced = replaceOpenDocument({
        flushUnsaved: autosave.flushDirtyToRecents,
        replace: () => {
          setOpen('metadata', 'name', 'Opened from Library')
        },
      })

      expect(replaced).toBe(false)
      expect(open.metadata?.name).toBe('Unsaved work')
      dispose()
    })
  })

  it('replaces once the user has answered the refusal question', () => {
    // The other half of the rule above: a no must stop the load, and a yes
    // must not leave the chokepoint refusing the replacement it was just
    // given permission for.
    return createRoot(async (dispose) => {
      const [open, setOpen] = createStore<FlameDescriptor>(
        JSON.parse(JSON.stringify(flame)),
      )
      const autosave = useWorkspaceAutosave({
        flameDescriptor: open,
        getTracks: () => [],
        getConfig: () => undefined,
        agentDriving: () => false,
        showToast: () => 0,
        confirmOverwriteOldest: declineOverwrite,
        confirmDiscardUnsaved: () => Promise.resolve(true),
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')
      storageRefuses = true

      expect(await autosave.prepareDocumentReplacement()).toBe(true)
      const replaced = replaceOpenDocument({
        flushUnsaved: autosave.flushDirtyToRecents,
        replace: () => {
          setOpen('metadata', 'name', 'Opened from Library')
        },
      })

      expect(replaced).toBe(true)
      expect(open.metadata?.name).toBe('Opened from Library')
      dispose()
    })
  })

  it('takes the load boundary inside the one function every load shares', () => {
    // `replaceLoadedFlame` is a closure inside MainWorkspace, which no test
    // can construct, so this is read off the source: what is checked is that
    // the boundary is taken where every replacement passes, and only for a
    // replacement that happened.
    //
    // Two of the four call sites reached that function and nothing else - an
    // accepted migration and a generated logo - so they took no boundary at
    // all: the session id was never rotated, and the new flame's autosaves
    // went into the entry the flush had just written the OUTGOING flame into,
    // and the baseline still described the document that had left.
    const ast = parseWorkspace()
    let body: ts.Block | undefined
    const find = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'replaceLoadedFlame' &&
        node.initializer !== undefined &&
        ts.isArrowFunction(node.initializer) &&
        ts.isBlock(node.initializer.body)
      ) {
        body = node.initializer.body
      }
      ts.forEachChild(node, find)
    }
    find(ast)
    expect(body).toBeDefined()
    if (!body) return

    const boundaries: ts.CallExpression[] = []
    const collect = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        calleeName(node) === 'markLoadedBaseline'
      ) {
        boundaries.push(node)
      }
      ts.forEachChild(node, collect)
    }
    collect(body)
    expect(boundaries).toHaveLength(1)

    // And after the chokepoint's answer, not before it: a refused
    // replacement opened nothing, so baselining there would mark the
    // document still on screen as freshly loaded and drop its unsaved work
    // from every writer.
    const start = boundaries[0]?.getStart(ast) ?? 0
    const gated = body.statements.some(
      (statement) =>
        statement.end <= start &&
        ts.isIfStatement(statement) &&
        mentions(statement.expression, 'replaced') &&
        containsReturn(statement.thenStatement),
    )
    expect(gated).toBe(true)
  })

  it('gives every bare replacement a timeline of its own', () => {
    // A `replaceLoadedFlame` that seeds no animation leaves the keyframe
    // tracks, frame rate and end frame of the document it replaced standing,
    // and then autosaves the new flame at them. The two call sites that do
    // not go through the load dialog - an accepted migration and a generated
    // logo - were both like that.
    const ast = parseWorkspace()
    const bare: string[] = []
    const walk = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        calleeName(node) === 'replaceLoadedFlame'
      ) {
        const scope = enclosingFunction(node)
        // Either this callback seeds the animation itself, or it is handed
        // to a hook that seeds one beside it - the shape the load dialog and
        // the drop handler use, because their seed sits in the same batch.
        const seedsItself = mentions(scope, 'setLoadedAnimation')
        const handedOver =
          scope.parent !== undefined &&
          ts.isPropertyAssignment(scope.parent) &&
          ts.isObjectLiteralExpression(scope.parent.parent) &&
          scope.parent.parent.properties.some((property) =>
            named(property, 'prepareReplace'),
          )
        if (!seedsItself && !handedOver) {
          const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast))
          bare.push(`MainWorkspace.tsx:${line + 1}`)
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(ast)
    expect(bare).toEqual([])
  })

  it('refuses to replace when the question was skipped', () => {
    // The backstop. A replacement added without the gate would otherwise
    // drop the open document's unsaved work at the cap, silently - so the
    // chokepoint keeps what is on screen instead.
    fillRecents()
    createRoot((dispose) => {
      const [open, setOpen] = createStore<FlameDescriptor>(
        JSON.parse(JSON.stringify(flame)),
      )
      const autosave = useWorkspaceAutosave({
        flameDescriptor: open,
        getTracks: () => [],
        getConfig: () => undefined,
        agentDriving: () => false,
        showToast: () => 0,
        confirmOverwriteOldest: declineOverwrite,
        confirmDiscardUnsaved: keepUnsaved,
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      const replaced = replaceOpenDocument({
        flushUnsaved: autosave.flushDirtyToRecents,
        replace: () => {
          setOpen('metadata', 'name', 'Opened from Library')
        },
      })

      expect(replaced).toBe(false)
      expect(open.metadata?.name).toBe('Unsaved work')
      expect(loadRecentFlamesForRewrite()).toHaveLength(MAX_RECENT_FLAMES)
      dispose()
    })
  })

  it('writes nothing when the open document holds nothing unsaved', () => {
    createRoot((dispose) => {
      const [open, setOpen] = createStore<FlameDescriptor>(
        JSON.parse(JSON.stringify(flame)),
      )
      const autosave = useWorkspaceAutosave({
        flameDescriptor: open,
        getTracks: () => [],
        getConfig: () => undefined,
        agentDriving: () => false,
        confirmOverwriteOldest: declineOverwrite,
        confirmDiscardUnsaved: keepUnsaved,
        showToast: () => 0,
      })
      autosave.markLoadedBaseline()

      replaceOpenDocument({
        flushUnsaved: autosave.flushDirtyToRecents,
        replace: () => {
          setOpen('metadata', 'name', 'Opened from Library')
        },
      })

      expect(loadRecentFlames()).toHaveLength(0)
      dispose()
    })
  })

  it('settles the cap question before every replacement it loads', () => {
    // `replaceLoadedFlame` is the workspace's one way to put a different
    // document on screen, and the chokepoint refuses a replacement whose
    // question was never asked. So a call that skips the gate does not fall
    // back to the old, destructive behaviour - it does nothing at all, and
    // the drop, the accepted migration or the generated logo behind it
    // appears to have been ignored. Three of the four call sites were like
    // that, because the gate was added at the load dialog only.
    //
    // Two shapes count as asking, and nothing else does. Either the
    // callback holding the call awaits `prepareDocumentReplacement` before
    // it, or the callback is handed to a hook beside a `prepareReplace`
    // that does - the shape the load dialog and the drop handler need,
    // because their replacement sits inside a batch with the animation seed
    // that an await must not split.
    const ast = parseWorkspace()
    const loads: string[] = []
    const ungated: string[] = []
    const walk = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        calleeName(node) === 'replaceLoadedFlame'
      ) {
        const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast))
        const at = `MainWorkspace.tsx:${line + 1}`
        loads.push(at)
        const scope = enclosingFunction(node)
        const asksItself = callsBefore(
          scope,
          'prepareDocumentReplacement',
          node.getStart(ast),
          ast,
        )
        const handedOver =
          scope.parent !== undefined &&
          ts.isPropertyAssignment(scope.parent) &&
          ts.isObjectLiteralExpression(scope.parent.parent) &&
          scope.parent.parent.properties.some(
            (property) =>
              named(property, 'prepareReplace') &&
              mentions(property, 'prepareDocumentReplacement'),
          )
        if (!asksItself && !handedOver) ungated.push(at)
      }
      ts.forEachChild(node, walk)
    }
    walk(ast)

    // A rename that walked past every call site would otherwise leave this
    // green while guarding nothing.
    expect(loads.length).toBeGreaterThan(0)
    expect(ungated).toEqual([])
  })

  it('records a load only for a replacement that happened', () => {
    // `replaceLoadedFlame` records a synthetic `flame.load` so a recording
    // can reproduce the document it opened. A refused replacement opened
    // nothing, and recording one hands replay a load of a flame that never
    // landed - every action after it is then applied to the wrong flame.
    //
    // Read off the source rather than run: `replaceLoadedFlame` is a
    // closure inside MainWorkspace, which no test can construct. What is
    // checked is that the recording is reached only through the
    // chokepoint's answer - an early return on it, or a branch that reads
    // it - and not that a recording is made, which recorder.test.ts covers.
    const ast = parseWorkspace()
    let body: ts.Block | undefined
    const find = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'replaceLoadedFlame' &&
        node.initializer !== undefined &&
        ts.isArrowFunction(node.initializer) &&
        ts.isBlock(node.initializer.body)
      ) {
        body = node.initializer.body
      }
      ts.forEachChild(node, find)
    }
    find(ast)
    expect(body).toBeDefined()
    if (!body) return

    // The answer, by whatever name it was bound to. Unbound - the call
    // written as a bare statement, which is how the return value came to be
    // ignored - leaves only the call itself, and then nothing below reads it.
    const answers = new Set(['replaceOpenDocument'])
    for (const statement of body.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declared of statement.declarationList.declarations) {
        if (
          declared.initializer !== undefined &&
          ts.isCallExpression(declared.initializer) &&
          calleeName(declared.initializer) === 'replaceOpenDocument' &&
          ts.isIdentifier(declared.name)
        ) {
          answers.add(declared.name.text)
        }
      }
    }
    const readsTheAnswer = (node: ts.Node) =>
      [...answers].some((name) => mentions(node, name))

    const records: ts.CallExpression[] = []
    const collect = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        calleeName(node) === 'recordSyntheticAction'
      ) {
        records.push(node)
      }
      ts.forEachChild(node, collect)
    }
    collect(body)
    // Same reason as above: a rename must not quietly empty this.
    expect(records.length).toBeGreaterThan(0)

    const unconditional: string[] = []
    for (const record of records) {
      const start = record.getStart(ast)
      const returnedEarly = body.statements.some(
        (statement) =>
          statement.end <= start &&
          ts.isIfStatement(statement) &&
          readsTheAnswer(statement.expression) &&
          containsReturn(statement.thenStatement),
      )
      let branched = false
      let scope: ts.Node = record
      while (scope !== body && scope.parent !== undefined) {
        scope = scope.parent
        if (ts.isIfStatement(scope) && readsTheAnswer(scope.expression)) {
          branched = true
        }
        if (
          ts.isConditionalExpression(scope) &&
          readsTheAnswer(scope.condition)
        ) {
          branched = true
        }
      }
      if (!returnedEarly && !branched) {
        const { line } = ast.getLineAndCharacterOfPosition(start)
        unconditional.push(`MainWorkspace.tsx:${line + 1}`)
      }
    }
    expect(unconditional).toEqual([])
  })

  it('loads nothing from a dropped file when the answer is no', async () => {
    // A drop replaces the open document like any other load, so at the cap
    // it is the same question - and the drop handler never asked it, so the
    // chokepoint refused and the drop was swallowed whole: no flame, no
    // timeline, and nothing said. The gate is handed in beside `replace`
    // because the replacement itself sits inside a batch with the animation
    // seed that an await must not split.
    fillRecents()
    loadFlameFromFileMock.mockResolvedValue({ flame })
    const toasts: string[] = []
    await createRoot(async (dispose) => {
      const [open, setOpen] = createStore<FlameDescriptor>(
        JSON.parse(JSON.stringify(flame)),
      )
      const autosave = useWorkspaceAutosave({
        flameDescriptor: open,
        getTracks: () => [],
        getConfig: () => undefined,
        agentDriving: () => false,
        showToast: (message) => toasts.push(message),
        confirmOverwriteOldest: declineOverwrite,
        confirmDiscardUnsaved: keepUnsaved,
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      const replace = vi.fn()
      const setLoadedAnimation = vi.fn()
      const onDrop = useAppDragAndDrop(
        {
          replace,
          prepareReplace: () => autosave.prepareDocumentReplacement(),
        },
        setLoadedAnimation,
      )
      await onDrop(new File(['flame'], 'Dropped.png'))

      // Nothing replaced the document, and nothing reset the timeline
      // underneath it either.
      expect(replace).not.toHaveBeenCalled()
      expect(setLoadedAnimation).not.toHaveBeenCalled()
      // The shelf they said not to touch is exactly as it was.
      const kept = loadRecentFlamesForRewrite()
      expect(kept).toHaveLength(MAX_RECENT_FLAMES)
      expect(kept.some((entry) => entry.id === 'kept-149')).toBe(true)
      expect(toasts.join(' ')).toContain('Kept the open flame')
      dispose()
    })
  })

  it('reads the answer a delete gives, rather than assuming it landed', () => {
    // `deleteRecentFlame` returns false when the localStorage write failed,
    // "so a caller can tell the user the entry is still there instead of
    // silently leaving it on screen" - its own docstring. The only call site
    // dropped that answer, so the row vanished from the list, came back on
    // the next read, and a user trying to free space deleted the same flame
    // over and over.
    //
    // Read off the source: the call sits inside a Solid component and a
    // modal flow no test can drive. What is checked is that the answer is
    // read at all - branched on, or bound to something.
    const ast = ts.createSourceFile(
      'LoadFlameModal.tsx',
      loadFlameModalSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const ignored: string[] = []
    const walk = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        calleeName(node) === 'deleteRecentFlame'
      ) {
        const parent = node.parent
        const read =
          parent !== undefined &&
          (ts.isIfStatement(parent) ||
            ts.isPrefixUnaryExpression(parent) ||
            ts.isVariableDeclaration(parent) ||
            ts.isBinaryExpression(parent) ||
            ts.isConditionalExpression(parent) ||
            ts.isReturnStatement(parent))
        if (!read) {
          const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast))
          ignored.push(`LoadFlameModal.tsx:${line + 1}`)
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(ast)
    expect(ignored).toEqual([])
  })

  it('loads a dropped file when no gate was handed in', async () => {
    // The gate is optional so that a caller settling nothing - the hook's
    // other users, and its own tests - drops files exactly as it always
    // has, rather than every drop stopping on an answer nobody gives.
    loadFlameFromFileMock.mockResolvedValue({ flame })
    const replace = vi.fn()
    const setLoadedAnimation = vi.fn()
    const onDrop = useAppDragAndDrop({ replace }, setLoadedAnimation)

    await onDrop(new File(['flame'], 'Dropped.png'))

    expect(replace).toHaveBeenCalledTimes(1)
    expect(setLoadedAnimation).toHaveBeenCalledTimes(1)
  })
})
