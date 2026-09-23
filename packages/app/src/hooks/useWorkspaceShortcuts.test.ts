/**
 * The workspace's own keys under an Arcade lock, through its keyboard hook and
 * a real timeline wired to the recorder the way MainWorkspace wires it.
 *
 * While the agent owns the screen the viewer is watching a take being made:
 * no key of theirs may edit it, rewind it, play it or put a step into it.
 * Space, undo and redo, the keyframe keys and the sidebar key all stand down.
 * A seat lock (a duel) is the opposite case, as it is for the command
 * shortcuts: the viewer is playing the other seat and keeps their keyboard.
 *
 * And two keys that claimed more than they used, lock or no lock: F with a
 * modifier and I with Ctrl or Cmd are the browser's (Ctrl+F is find), and I
 * with nothing to keyframe is nobody's, Shift+I included.
 */
import '@/commands/builtins'
import { createRoot } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetPilot, startPilot } from '@/arcade/pilot'
import { executeCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { createRecorderAwareTimeline } from '@/recorder/timelineActions'
import { createTimelineState } from '@/utils/timeline'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts'
import type { SeatId } from '@/seats/seatId'

function drive(lock: 'screen' | 'seat', seatId: SeatId) {
  startPilot({
    mode: lock === 'screen' ? 'cinema' : 'duel',
    title: 'Driving',
    stepBudget: 10,
    allowed: ['flame.', 'timeline.'],
    qualityRankAtStart: 1,
    seatId,
    lock,
  })
}

/** Disposed after each test, so a failed assertion cannot leave a listener
 *  behind to answer the next test's Space a second time. */
let disposeHook: (() => void) | undefined

type MountOptions = {
  targetedParameter?: () => string | null
  canUndo?: boolean
  canRedo?: boolean
}

/** The hook mounted over a real timeline. Effects created inside
 *  `createRoot` flush as it returns, so the listener exists once we are out.
 *  The sidebar toggle and the two keyframe writes are spies, so a test can
 *  ask whether a key reached them at all. */
function mount(options: MountOptions = {}) {
  const timeline = createTimelineState()
  const ctx = createMockCommandContext()
  const recorderTimeline = createRecorderAwareTimeline(
    timeline,
    (id, ...args) => {
      executeCommand(id, ctx, ...args)
    },
  )
  const toggleSidebar = vi.fn()
  const addKeyframe = vi.fn()
  const removeKeyframe = vi.fn()
  disposeHook = createRoot((dispose) => {
    useWorkspaceShortcuts({
      getCmdContext: () => ctx,
      sidebarDiffView: () => null,
      closeSidebarDiff: () => {},
      toggleSidebarAsAuthoredAction: toggleSidebar,
      undoRouter: {
        canUndo: () => options.canUndo ?? false,
        canRedo: () => options.canRedo ?? false,
      },
      theme: () => 'dark',
      setTheme: () => {},
      targetedParameter: options.targetedParameter ?? (() => null),
      recorderTimeline: {
        togglePlay: recorderTimeline.togglePlay,
        addKeyframeAtCurrentFrame: addKeyframe,
        removeKeyframe,
      },
      timeline,
      showTimeline: () => true,
      animationEnabled: () => true,
    })
    return dispose
  })
  return { timeline, ctx, toggleSidebar, addKeyframe, removeKeyframe }
}

/** A key as the browser delivers it, returned so a test can ask whether the
 *  app claimed it. */
function press(
  code: string,
  key: string,
  modifiers: Partial<
    Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>
  > = {},
): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    code,
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  })
  document.dispatchEvent(ev)
  return ev
}

function pressSpace(): KeyboardEvent {
  return press('Space', ' ')
}

function stopTake() {
  const session = stopSessionRecording()
  if (!session) throw new Error('expected a finished take')
  return session
}

describe('Space under an Arcade lock', () => {
  afterEach(() => {
    disposeHook?.()
    disposeHook = undefined
    cancelSessionRecording()
    resetPilot()
  })

  it('leaves the playback alone while the agent owns the screen, and records nothing', () => {
    const { timeline } = mount()
    startSessionRecording(examples.example1)
    drive('screen', 'player')

    const ev = pressSpace()

    expect(timeline.isPlaying()).toBe(false)
    // Not claimed either, so a focused Stop button still gets its Space.
    expect(ev.defaultPrevented).toBe(false)
    const session = stopTake()
    expect(session.actions).toEqual([])
    expect(session.unnamedWriteCount).toBe(0)
  })

  it('lets nothing further along act on Space while the agent owns the screen', () => {
    // Where the audio panel listens: on window, after the workspace. It
    // toggles its track on Space, and a viewer can leave it open, track
    // loaded, when a session starts.
    mount()
    drive('screen', 'player')
    const later = vi.fn()
    window.addEventListener('keydown', later)
    try {
      pressSpace()
    } finally {
      window.removeEventListener('keydown', later)
    }

    expect(later).not.toHaveBeenCalled()
  })

  it('plays and records the step once the viewer has the screen back', () => {
    const { timeline } = mount()
    drive('screen', 'player')
    resetPilot()
    startSessionRecording(examples.example1)

    const ev = pressSpace()

    expect(timeline.isPlaying()).toBe(true)
    expect(ev.defaultPrevented).toBe(true)
    const session = stopTake()
    expect(session.actions.map(({ id, args }) => [id, ...args])).toEqual([
      ['timeline.setPlaying', true, 0],
    ])
    expect(session.unnamedWriteCount).toBe(0)
  })

  it('keeps Space for the viewer playing the other seat of a duel', () => {
    const { timeline } = mount()
    drive('seat', 'rival')

    pressSpace()

    expect(timeline.isPlaying()).toBe(true)
  })
})

/** Undo and redo in every spelling the hook answers to. */
const HISTORY_KEYS = [
  { name: 'Ctrl+Z', code: 'KeyZ', key: 'z', mods: { ctrlKey: true } },
  { name: 'Cmd+Z', code: 'KeyZ', key: 'z', mods: { metaKey: true } },
  {
    name: 'Ctrl+Shift+Z',
    code: 'KeyZ',
    key: 'Z',
    mods: { ctrlKey: true, shiftKey: true },
  },
  {
    name: 'Cmd+Shift+Z',
    code: 'KeyZ',
    key: 'Z',
    mods: { metaKey: true, shiftKey: true },
  },
  { name: 'Ctrl+Y', code: 'KeyY', key: 'y', mods: { ctrlKey: true } },
  { name: 'Cmd+Y', code: 'KeyY', key: 'y', mods: { metaKey: true } },
] as const

describe('undo and redo under an Arcade lock', () => {
  afterEach(() => {
    disposeHook?.()
    disposeHook = undefined
    cancelSessionRecording()
    resetPilot()
  })

  it.each(HISTORY_KEYS)(
    '$name neither rewinds the take nor records a step while the agent owns the screen',
    ({ code, key, mods }) => {
      const { ctx } = mount({ canUndo: true, canRedo: true })
      startSessionRecording(examples.example1)
      drive('screen', 'player')

      const ev = press(code, key, mods)

      expect(ctx.history?.undo).not.toHaveBeenCalled()
      expect(ctx.history?.redo).not.toHaveBeenCalled()
      expect(ev.defaultPrevented).toBe(false)
      const session = stopTake()
      expect(session.actions).toEqual([])
      expect(session.unnamedWriteCount).toBe(0)
    },
  )

  it('undoes and redoes again once the viewer has the screen back', () => {
    const { ctx } = mount({ canUndo: true, canRedo: true })
    drive('screen', 'player')
    resetPilot()

    const undo = press('KeyZ', 'z', { ctrlKey: true })
    const redo = press('KeyY', 'y', { ctrlKey: true })

    expect(ctx.history?.undo).toHaveBeenCalledTimes(1)
    expect(ctx.history?.redo).toHaveBeenCalledTimes(1)
    expect(undo.defaultPrevented).toBe(true)
    expect(redo.defaultPrevented).toBe(true)
  })

  it('keeps undo and redo for the viewer playing the other seat of a duel', () => {
    const { ctx } = mount({ canUndo: true, canRedo: true })
    drive('seat', 'rival')

    press('KeyZ', 'z', { ctrlKey: true })
    press('KeyZ', 'Z', { ctrlKey: true, shiftKey: true })

    expect(ctx.history?.undo).toHaveBeenCalledTimes(1)
    expect(ctx.history?.redo).toHaveBeenCalledTimes(1)
  })
})

describe('the keyframe keys', () => {
  afterEach(() => {
    disposeHook?.()
    disposeHook = undefined
    resetPilot()
  })

  const target = () => 'renderSettings.exposure'

  it('I and Alt+I write nothing while the agent owns the screen', () => {
    const { addKeyframe, removeKeyframe } = mount({ targetedParameter: target })
    drive('screen', 'player')

    const add = press('KeyI', 'i')
    const remove = press('KeyI', 'i', { altKey: true })

    expect(addKeyframe).not.toHaveBeenCalled()
    expect(removeKeyframe).not.toHaveBeenCalled()
    expect(add.defaultPrevented).toBe(false)
    expect(remove.defaultPrevented).toBe(false)
  })

  it('I and Alt+I keyframe the targeted parameter with the lock off and under a seat lock', () => {
    const { addKeyframe, removeKeyframe } = mount({ targetedParameter: target })

    expect(press('KeyI', 'i').defaultPrevented).toBe(true)
    drive('seat', 'rival')
    expect(press('KeyI', 'i', { altKey: true }).defaultPrevented).toBe(true)

    expect(addKeyframe).toHaveBeenCalledWith('renderSettings.exposure')
    expect(removeKeyframe).toHaveBeenCalledWith('renderSettings.exposure', 0)
  })

  it('I and Alt+I leave the key alone when there is nothing to keyframe', () => {
    const { addKeyframe, removeKeyframe } = mount()

    const add = press('KeyI', 'i')
    const remove = press('KeyI', 'i', { altKey: true })

    expect(addKeyframe).not.toHaveBeenCalled()
    expect(removeKeyframe).not.toHaveBeenCalled()
    expect(add.defaultPrevented).toBe(false)
    expect(remove.defaultPrevented).toBe(false)
  })

  // Once I stopped claiming the key with nothing targeted, Shift+I fell
  // through to a command shortcut nobody could reach before: it set the
  // skipped iterations to 1.
  it('Shift+I with nothing targeted changes nothing', () => {
    const { ctx, addKeyframe } = mount()

    const ev = press('KeyI', 'I', { shiftKey: true })

    expect(ctx.setFlameDescriptor).not.toHaveBeenCalled()
    expect(ctx.flameDescriptor().renderSettings.skipIters).toBe(20)
    expect(addKeyframe).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('Shift+I keyframes the targeted parameter, as I does', () => {
    const { addKeyframe } = mount({ targetedParameter: target })

    expect(press('KeyI', 'I', { shiftKey: true }).defaultPrevented).toBe(true)
    expect(addKeyframe).toHaveBeenCalledWith('renderSettings.exposure')
  })

  it.each([
    { name: 'Ctrl+I', mods: { ctrlKey: true } },
    { name: 'Cmd+I', mods: { metaKey: true } },
    { name: 'Ctrl+Alt+I', mods: { ctrlKey: true, altKey: true } },
    { name: 'Cmd+Alt+I', mods: { metaKey: true, altKey: true } },
  ])('$name is left to the browser and keyframes nothing', ({ mods }) => {
    const { addKeyframe, removeKeyframe } = mount({ targetedParameter: target })

    const ev = press('KeyI', 'i', mods)

    expect(addKeyframe).not.toHaveBeenCalled()
    expect(removeKeyframe).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })
})

describe('the sidebar key', () => {
  afterEach(() => {
    disposeHook?.()
    disposeHook = undefined
    resetPilot()
  })

  it('F toggles the sidebar with the lock off and under a seat lock', () => {
    const { toggleSidebar } = mount()

    expect(press('KeyF', 'f').defaultPrevented).toBe(true)
    drive('seat', 'rival')
    press('KeyF', 'f')

    expect(toggleSidebar).toHaveBeenCalledTimes(2)
  })

  it.each([
    { name: 'F', mods: {} },
    { name: 'Shift+F', mods: { shiftKey: true } },
    { name: 'Alt+F', mods: { altKey: true } },
    { name: 'Ctrl+F', mods: { ctrlKey: true } },
    { name: 'Cmd+F', mods: { metaKey: true } },
  ])(
    '$name leaves the sidebar alone while the agent owns the screen',
    ({ mods }) => {
      const { toggleSidebar } = mount()
      drive('screen', 'player')

      const ev = press('KeyF', 'f', mods)

      expect(toggleSidebar).not.toHaveBeenCalled()
      expect(ev.defaultPrevented).toBe(false)
    },
  )

  it.each([
    { name: 'Ctrl+F', mods: { ctrlKey: true } },
    { name: 'Cmd+F', mods: { metaKey: true } },
    { name: 'Alt+F', mods: { altKey: true } },
    { name: 'Shift+F', mods: { shiftKey: true } },
  ])(
    '$name is left to the browser, find included, and toggles nothing',
    ({ mods }) => {
      const { toggleSidebar } = mount()

      const ev = press('KeyF', 'f', mods)

      expect(toggleSidebar).not.toHaveBeenCalled()
      expect(ev.defaultPrevented).toBe(false)
    },
  )
})
