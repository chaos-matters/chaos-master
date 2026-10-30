/**
 * A replay with Glide on, against the workspace's real history and glide
 * runtime: the cut that follows a glide lands on the recorded flame.
 *
 * The player opens its batch (`beginBatch`, the history's owned preview) at
 * the start of every Play and every seek. The history tells its host when a
 * preview opens, and the host hands the document back from any transition in
 * flight, because a person opening a gesture owns the frame on screen. Replay
 * machinery is exempt from that only inside `withRecordingSuppressed`. The
 * batch was opened outside it, so stepping forward while the last step's
 * glide was still moving froze that glide on a half-way frame, and the next
 * step was applied on top of it: the palette after a preset landed on a flame
 * that was neither (G5 F2, 2026-10-30).
 */
import '@/commands/builtins'
import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { setGlideRuntime, settleGlideBeforeTimeTravel, yieldGlideToDocumentWrite, } from '@/flame/glide/runtime'
import { mountTestGlideRuntime } from '@/flame/glide/testRuntime'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createSessionPlayer } from './player'
import { withRecordingSuppressed } from './recorder'
import { SESSION_FORMAT_VERSION } from './schema'
import type { RecordedAction, RecordedSession } from './schema'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HistoryPreviewOwner } from '@/utils/createStoreHistory'

const PALETTE = {
  id: 'g5-test',
  name: 'G5 test',
  entries: [
    { id: 'a', position: 0, a: 0.15, b: 0.85 },
    { id: 'b', position: 1, a: 0.9, b: 0.1 },
  ],
}

/** The G5 take: two scalar steps, a preset, and a palette 300 ms later. */
const take: RecordedSession = {
  version: SESSION_FORMAT_VERSION,
  app: { version: 'test', flameSchemaVersion: '1.0' },
  createdAt: new Date(0).toISOString(),
  initial: deepClone(examples.barnsleyFern),
  actions: [
    { t: 0, id: 'flame.setGamma', args: [4] },
    { t: 900, id: 'flame.setExposure', args: [0.5] },
    { t: 1800, id: 'flame.loadPreset', args: ['goldenApollonianGasket'] },
    { t: 2100, id: 'flame.applyPalette', args: [PALETTE] },
  ] satisfies RecordedAction[],
  unnamedWriteCount: 0,
} as unknown as RecordedSession

/** The workspace's history wiring and replay target (useWorkspaceReplay). */
function mount() {
  vi.useFakeTimers()
  const [flame, setFlame, history] = createStoreHistory(
    createStore<FlameDescriptor>(deepClone(take.initial)),
    {
      journal: true,
      onPreviewStarted: yieldGlideToDocumentWrite,
      onBeforeDocumentWrite: yieldGlideToDocumentWrite,
      onBeforeTimeTravel: settleGlideBeforeTimeTravel,
    },
  )
  const glide = mountTestGlideRuntime(
    () => flame,
    (next) => {
      history.replaceSilently(next)
    },
  )
  const ctx = {
    beforeCommand: () => {
      history.takeOverOwnedPreview()
    },
    flameDescriptor: () => flame,
    setFlameDescriptor: setFlame,
  } as unknown as CommandContext
  let owner: HistoryPreviewOwner | undefined
  const player = createSessionPlayer(
    take,
    {
      loadInitial: (next) => {
        setFlame(() => deepClone(next), 'Replay: initial state')
      },
      execute: (id, args) => executeReplayCommand(id, ctx, ...args),
      readFlame: () => deepClone(flame),
      glide: (from, durationMs) => {
        void glide.runtime.glideFrom(from, { durationMs })
      },
      settleGlide: () => glide.runtime.settleForNextChange(),
      beginBatch: (onTakeover) => {
        owner = history.startOwnedPreview('Replay', onTakeover)
      },
      withBatchWrite: (fn) =>
        owner === undefined ? fn() : history.withPreviewOwner(owner, fn),
      endBatch: () => {
        const closing = owner
        owner = undefined
        if (closing === undefined) return
        withRecordingSuppressed(() => history.commitOwnedPreview(closing))
      },
    },
    { glide: () => ({ enabled: true }) },
  )
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 16) {
      vi.advanceTimersByTime(16)
      glide.advance(16)
    }
  }
  return { flame, glide, player, run }
}

afterEach(() => {
  vi.useRealTimers()
  setGlideRuntime(undefined)
})

describe('a replay with Glide on, on the workspace history', () => {
  it('stepping onto the palette while the preset still glides lands on the recorded flame', () => {
    createRoot((dispose) => {
      const { flame, glide, player, run } = mount()
      player.seek(0)
      player.seek(2)
      // The preset is gliding in when the next step is clicked.
      run(300)
      expect(glide.runtime.isGliding()).toBe(true)

      player.seek(3)
      run(3000)
      expect(glide.runtime.isGliding()).toBe(false)
      const stepped = deepClone(flame)

      // The same step, rebuilt from the start of the take with no glide.
      player.seek(3)
      expect(stepped.renderSettings.palette).toEqual(PALETTE)
      expect(stepped).toEqual(deepClone(flame))

      dispose()
    })
  })

  it('a take played through ends on the recorded flame once its last glide lands', () => {
    createRoot((dispose) => {
      const { flame, glide, player, run } = mount()
      player.play()
      run(10_000)
      expect(player.isFinished()).toBe(true)
      expect(glide.runtime.isGliding()).toBe(false)
      const played = deepClone(flame)

      player.seek(3)
      expect(played.renderSettings.palette).toEqual(PALETTE)
      expect(played).toEqual(deepClone(flame))

      dispose()
    })
  })
})
