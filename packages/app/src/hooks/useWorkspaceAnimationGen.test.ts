import '@/commands/builtins'
import { createRoot, createSignal } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { snapshotOrigin } from '@/recorder/snapshotOrigin'
import { createRecorderAwareTimeline, snapshotTimeline, } from '@/recorder/timelineActions'
import { deepClone } from '@/utils/clone'
import { createTimelineState } from '@/utils/timeline'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { useWorkspaceAnimationGen } from './useWorkspaceAnimationGen'

/**
 * Randomize and Smart Animation both draw from Math.random(), so a session can
 * only replay them from a value-pinned timeline snapshot. That snapshot is
 * emitted by the recorder-aware timeline; given the raw one, the action runs,
 * looks fine, and silently drops out of the recording.
 */
function makeWorld() {
  const flame = deepClone(examples.example1)
  const raw = createTimelineState()
  const recorderTimeline = createRecorderAwareTimeline(raw, () => {})
  const [, setAnimationEnabled] = createSignal(false)
  const gen = useWorkspaceAnimationGen({
    timeline: raw,
    recorderTimeline,
    flameDescriptor: flame,
    getCmdContext: () => createMockCommandContext(),
    setAnimationEnabled,
    setIsRandomizingAnimation: () => {},
  })
  return { flame, raw, gen }
}

function recordedTimelineLoads() {
  const session = stopSessionRecording()
  if (!session) throw new Error('no active recording')
  return session.actions.filter((a) => a.id === 'timeline.loadTimeline')
}

afterEach(() => {
  cancelSessionRecording()
})

describe('useWorkspaceAnimationGen', () => {
  it('records Randomize Animation as one replayable timeline snapshot', () => {
    createRoot((dispose) => {
      const { flame, raw, gen } = makeWorld()
      startSessionRecording(flame, { timeline: snapshotTimeline(raw) })

      gen.handleRandomizeAnimation(['pan', 'zoom'], true)

      const loads = recordedTimelineLoads()
      expect(loads).toHaveLength(1)
      expect(loads[0]?.args[1]).toEqual(
        snapshotOrigin('timeline.random', 'pan, zoom'),
      )
      dispose()
    })
  })

  it('records Smart Animation as one replayable timeline snapshot', () => {
    createRoot((dispose) => {
      const { flame, raw, gen } = makeWorld()
      startSessionRecording(flame, { timeline: snapshotTimeline(raw) })

      gen.handleSmartAnimation(true)

      const loads = recordedTimelineLoads()
      expect(loads).toHaveLength(1)
      expect(loads[0]?.args[1]).toEqual(snapshotOrigin('timeline.smart'))
      dispose()
    })
  })
})
