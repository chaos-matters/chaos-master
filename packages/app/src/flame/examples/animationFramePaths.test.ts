/**
 * What a user does with a frame between two keyframes, path by path.
 *
 * `animationFrames.test.ts` proves the resolver yields valid frames; this file
 * proves each way a frame leaves playback still passes through it: the PNG a
 * paused frame exports, the document an undo writes the resolved value into,
 * a replayed take's held frame, and a glide between two documents.
 *
 * The two animations are the audit's: `ex1-probability-dance` interpolates
 * skipIters 20 -> 10 over frames 0-30, so frame 7 resolves to 17.67, and
 * `ex12-color-refraction` sweeps palettePhase 0 -> 1.5 over the same frames,
 * so frame 25 resolves to 1.25.
 */
import { describe, expect, it } from 'vitest'
import { planGlide } from '@/flame/glide/plan'
import { sampleGlide } from '@/flame/glide/sample'
import { makeFlame } from '@/flame/glide/testUtils'
import { isGlideRefusal } from '@/flame/glide/types'
import { validateFlame } from '@/flame/schema/flameSchema'
import { useWorkspaceTimelineBinding } from '@/hooks/useWorkspaceTimelineBinding'
import { createReplayVideoDriver } from '@/recorder/replayVideo'
import { SESSION_FORMAT_VERSION } from '@/recorder/schema'
import { deepClone } from '@/utils/clone'
import { addFlameDataToPng, extractFlameFromPng } from '@/utils/flameInPng'
import { compressJsonQueryParam, decodeSharePayload, encodeSharePayload, } from '@/utils/jsonQueryParam'
import { applyTimelineToFlame, applyTimelineToFlameAtFrame, createTimelineState, defaultConfig, } from '@/utils/timeline'
import { animationDefs, getAnimationFlame } from './animations'
import type { RecordedSession } from '@/recorder/schema'

function animation(id: string) {
  const anim = animationDefs.find((a) => a.id === id)
  if (!anim) throw new Error(`no bundled animation ${id}`)
  return anim
}

const PAUSED = [
  { id: 'ex1-probability-dance', frame: 7 },
  { id: 'ex12-color-refraction', frame: 25 },
] as const

/** What the export dialog, the scripted export and the video export call. */
function exportedFrame(id: string, frame: number) {
  const anim = animation(id)
  const flame = deepClone(getAnimationFlame(anim))
  const timeline = { tracks: () => anim.tracks, config: () => defaultConfig() }
  applyTimelineToFlameAtFrame(timeline, flame, frame)
  return flame
}

describe('a frame between keyframes, on every path out of playback', () => {
  it.each(PAUSED)(
    'the live canvas frame of $id at $frame validates',
    ({ id, frame }) => {
      const anim = animation(id)
      const timeline = createTimelineState()
      timeline.loadTracks(deepClone(anim.tracks))
      timeline.goToFrame(frame)
      const flame = deepClone(getAnimationFlame(anim))
      applyTimelineToFlame(timeline, flame)
      expect(() => validateFlame(deepClone(flame))).not.toThrow()
    },
  )

  it.each(PAUSED)(
    'a PNG exported while $id is paused at $frame opens again',
    async ({ id, frame }) => {
      // Same encoding as ExportJobHost with "embed flame" on (the default).
      const encoded = await compressJsonQueryParam(exportedFrame(id, frame))
      const png = addFlameDataToPng(encoded, new Uint8Array(8))
      const reopened = extractFlameFromPng(
        new Uint8Array(await png.arrayBuffer()),
      )
      await expect(reopened).resolves.toHaveProperty('flame')
    },
  )

  it('undo while paused between keyframes leaves a document that still shares', async () => {
    const document = makeFlame({ transforms: { t1: {} } })
    const timeline = createTimelineState()
    useWorkspaceTimelineBinding({
      flameDescriptor: document,
      history: {
        setSilently: (update) => {
          update(document)
        },
      },
      timeline,
      blendWeight: () => 0,
    })
    timeline.addKeyframe('skipIters', 0, 10, 'linear')
    timeline.addKeyframe('skipIters', 10, 15, 'linear')
    timeline.breakUndoCoalescing()
    timeline.goToFrame(5)
    // Re-key frame 10 to 20, then Ctrl+Z with the playhead still on frame 5:
    // the undo restores 10 -> 15 and writes the value at frame 5 back, 12.5.
    timeline.addKeyframe('skipIters', 10, 20, 'linear')
    timeline.timelineUndo()
    expect(timeline.tracks()[0]?.keyframes).toHaveLength(2)

    const link = await encodeSharePayload(document)
    await expect(decodeSharePayload(link)).resolves.toHaveProperty('flame')
  })

  it('a replayed take holding a paused frame poses a valid flame', () => {
    const anim = animation('ex1-probability-dance')
    const session: RecordedSession = {
      version: SESSION_FORMAT_VERSION,
      app: { version: 'test', flameSchemaVersion: '1.0' },
      createdAt: new Date(0).toISOString(),
      initial: deepClone(getAnimationFlame(anim)),
      actions: [{ t: 0, id: 'flame.setGamma', args: [1.7] }],
      unnamedWriteCount: 0,
      initialTimeline: {
        config: defaultConfig(),
        currentFrame: 7,
        animationEnabled: true,
        autoKeyframe: false,
        previewHeld: true,
        tracks: deepClone(anim.tracks),
      },
    }
    const posed = createReplayVideoDriver(session).advanceTo(0).flame
    expect(() => validateFlame(deepClone(posed))).not.toThrow()
  })

  it('a glide between two whole skipIters passes only whole ones', () => {
    const from = makeFlame({
      transforms: { t1: {} },
      renderSettings: { skipIters: 10 },
    })
    const to = makeFlame({
      transforms: { t1: {} },
      renderSettings: { skipIters: 15, gamma: 3 },
    })
    const plan = planGlide(from, to, { durationMs: 800, fps: 24 })
    if (isGlideRefusal(plan)) throw new Error(plan.reason)
    const halfway = sampleGlide(plan, 0.5)
    expect(() => validateFlame(deepClone(halfway))).not.toThrow()
  })
})
