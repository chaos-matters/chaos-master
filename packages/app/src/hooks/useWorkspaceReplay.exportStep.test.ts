/**
 * An export step in a take, as the live replay plays it.
 *
 * Opening the export dialog is a recorded step (`export.png`,
 * `export.animation`): it changes nothing a replay reproduces, but the take
 * shows where the viewer went. The replay ran it against the workspace's own
 * command context, so the dialog opened over the replay, and in a
 * full-interface export (which plays this same replay while the tab is
 * captured) over the video being made. The step still plays, in its place in
 * the list, and opens nothing. The artwork export and the synthesize sandbox
 * never could: their worlds keep their own no-op modal (recorder/replayVideo.ts,
 * recorder/synthesize/sandbox.ts).
 */
import '@/commands/builtins'
import { createRoot } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { createSessionPlayer } from '@/recorder/player'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { createReplayVideoDriver } from '@/recorder/replayVideo'
import { SESSION_FORMAT_VERSION } from '@/recorder/schema'
import { replaySessionHeadless } from '@/recorder/synthesize/replaySandbox'
import { deepClone } from '@/utils/clone'
import { dismissJob, enqueueAnimationJob, enqueueImageJob, exportJobs, } from '@/utils/exportJobs'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { useWorkspaceReplay } from './useWorkspaceReplay'
import type { UseWorkspaceReplayParams } from './useWorkspaceReplay'
import type { CommandContext } from '@/commands/types'
import type { ReplayTarget } from '@/recorder/replay'
import type { RecordedSession } from '@/recorder/schema'
import type { AnimationJobSpec, ImageJobSpec } from '@/utils/exportJobs'

/** The live replay's target over a workspace whose context can open the
 *  export dialog. Only what a step's `execute` reads is real. */
function liveReplay() {
  const cmdContext = createMockCommandContext()
  const params = {
    flameDescriptor: deepClone(examples.example1),
    cmdContext,
    view: {
      prePaletteColors: () => ({}),
      setPrePaletteColors: vi.fn(),
    },
    sonification: { loadSnapshot: vi.fn() },
  } as unknown as UseWorkspaceReplayParams
  const { replayTarget } = createRoot(() => useWorkspaceReplay(params))
  return {
    replayTarget,
    cmdContext,
    openModal: vi.mocked(cmdContext.modal.open),
  }
}

/** The target as the player drives it, with the workspace's side-state
 *  bookkeeping left out: what is under test is the step. */
function driven(replayTarget: ReplayTarget): ReplayTarget {
  return {
    loadInitial: () => {},
    execute: replayTarget.execute,
    beginBatch: () => {},
    endBatch: () => {},
  }
}

function take(exportId: string): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(examples.example1),
    actions: [
      { t: 0, id: 'camera.center', args: [] },
      { t: 1000, id: exportId, args: [] },
      { t: 2000, id: 'camera.center', args: [] },
    ],
    unnamedWriteCount: 0,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cancelSessionRecording()
  vi.useRealTimers()
})

describe('an export step in the live replay', () => {
  it.each(['export.png', 'export.animation'])(
    'is in the take: %s from the keyboard or a button records a step',
    (id) => {
      const ctx = createMockCommandContext()
      startSessionRecording(deepClone(examples.example1))
      executeCommand(id, ctx)
      const session = stopSessionRecording()

      expect(session?.actions.map((action) => action.id)).toEqual([id])
    },
  )

  it.each(['export.png', 'export.animation'])(
    '%s runs and opens no dialog',
    (id) => {
      const { replayTarget, openModal } = liveReplay()

      expect(replayTarget.execute(id, [])).toBe(true)

      expect(openModal).not.toHaveBeenCalled()
    },
  )

  it.each(['export.png', 'export.animation'])(
    '%s keeps its place in the list as the take plays',
    (id) => {
      const { replayTarget, openModal } = liveReplay()
      const player = createSessionPlayer(take(id), driven(replayTarget))

      player.play()
      vi.advanceTimersByTime(0)
      vi.advanceTimersByTime(1000)

      // The export step is the step on screen, spotlight and all.
      expect(player.stepIndex()).toBe(1)
      expect(player.currentAction()?.id).toBe(id)
      expect(openModal).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)
      expect(player.stepIndex()).toBe(2)
      vi.runAllTimers()
      expect(player.isFinished()).toBe(true)
      expect(player.lastError()).toBeUndefined()
      expect(player.total).toBe(3)
      player.stop()
    },
  )

  it('leaves every other part of the workspace to the step', () => {
    const { replayTarget, cmdContext } = liveReplay()

    expect(replayTarget.execute('camera.center', [])).toBe(true)

    expect(cmdContext.setZoom).toHaveBeenCalledWith(1)
  })
})

/** The two render steps a hand-written take can carry. */
const RENDERS = [
  ['export.renderImage', { width: 64, height: 64 }],
  ['export.renderAnimation', { width: 64, height: 64, fps: 30 }],
] as const

function renderTake(): RecordedSession {
  return {
    ...take('export.png'),
    actions: [
      { t: 0, id: 'camera.center', args: [] },
      ...RENDERS.map(([id, options], index) => ({
        t: 1000 * (index + 1),
        id,
        args: [options],
      })),
      { t: 3000, id: 'camera.center', args: [] },
    ],
  }
}

/** The workspace's export host, queueing into the real job store. */
function withExportHost(cmdContext: CommandContext) {
  const host = {
    renderImage: vi.fn(() => {
      enqueueImageJob({ name: 'live' } as ImageJobSpec)
    }),
    renderAnimation: vi.fn(() => {
      enqueueAnimationJob({ name: 'live' } as AnimationJobSpec)
    }),
  }
  cmdContext.exportJobs = host
  return host
}

describe('a render step in a replay', () => {
  afterEach(() => {
    for (const job of [...exportJobs()]) dismissJob(job.id)
  })

  it('queues nothing when the live replay plays it, and keeps its place', () => {
    const { replayTarget, cmdContext } = liveReplay()
    const host = withExportHost(cmdContext)
    const player = createSessionPlayer(renderTake(), driven(replayTarget))

    player.play()
    vi.advanceTimersByTime(0)
    const shown: (string | undefined)[] = []
    for (let step = 1; step <= RENDERS.length; step++) {
      vi.advanceTimersByTime(1000)
      shown.push(player.currentAction()?.id)
    }
    vi.runAllTimers()

    expect(shown).toEqual(RENDERS.map(([id]) => id))
    expect(player.isFinished()).toBe(true)
    expect(player.lastError()).toBeUndefined()
    expect(host.renderImage).not.toHaveBeenCalled()
    expect(host.renderAnimation).not.toHaveBeenCalled()
    expect(exportJobs()).toEqual([])
  })

  it('still renders when an agent runs it live, outside a replay', () => {
    const { cmdContext } = liveReplay()
    const host = withExportHost(cmdContext)

    for (const [id, options] of RENDERS) executeCommand(id, cmdContext, options)

    expect(host.renderImage).toHaveBeenCalledOnce()
    expect(host.renderAnimation).toHaveBeenCalledOnce()
    expect(exportJobs()).toHaveLength(2)
  })

  it('cannot render in the artwork export or the synthesize sandbox', () => {
    const session = renderTake()
    const driver = createReplayVideoDriver(session)

    driver.advanceTo(session.actions.length - 1)
    expect(replaySessionHeadless(session)).toBeDefined()

    expect(exportJobs()).toEqual([])
  })
})
