import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import { vec2f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { executeCommand } from '@/commands/registry'
import { MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from '@/flame/schema/flameSchema'
import { recorderStream } from '@/recorder/recorder'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createTimelineState } from '@/utils/timeline'
import { DEFAULT_SEAT } from './seatId'
import type { Accessor, Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { SeatId } from './seatId'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { RecorderStream } from '@/recorder/recorder'
import type { HistorySetter } from '@/utils/createStoreHistory'
import type { TimelineState } from '@/utils/timeline'

/**
 * One editing unit: a flame with its history and timeline, a recorder stream,
 * and a CommandContext over them.
 *
 * The workspace is the `player` seat and is deliberately NOT built from this —
 * wrapping 7871 lines of MainWorkspace would be the large refactor the split-
 * screen design exists to avoid. This builds the seats that have no editor
 * chrome of their own: today the duel's rival, later anything that needs a
 * second live flame.
 *
 * The camera lives inside the flame (`renderSettings.camera`), exactly as the
 * workspace keeps it, so a camera move is an ordinary recorded command rather
 * than a signal the log cannot see.
 */
export interface Seat {
  readonly id: SeatId
  flame: Accessor<FlameDescriptor>
  history: ReturnType<typeof createStoreHistory<FlameDescriptor>>[2]
  timeline: TimelineState
  stream: RecorderStream
  ctx: CommandContext
  zoom: Accessor<number>
  setZoom: Setter<number>
  position: Accessor<v2f>
  setPosition: Setter<v2f>
  dispose(): void
}

export function createSeat(id: SeatId, initial: FlameDescriptor): Seat {
  return createRoot((disposeRoot) => {
    const stream = recorderStream(id)
    const [flame, setFlame, history] = createStoreHistory<FlameDescriptor>(
      createStore(deepClone(initial)),
      {
        // Deliberately NOT journaled. The app-wide undo journal is what lets
        // one Ctrl+Z arbitrate between the workspace's flame and its timeline;
        // a seat with no keyboard of its own joining it would put the rival's
        // edits inside the viewer's undo stack.
        journal: false,
        onEntryPushed: (description, fromPreview) => {
          stream.reportDocumentWrite(description, fromPreview)
        },
        onPreviewStarted: () => {
          stream.notePreviewStarted()
        },
      },
    )
    const timeline = createTimelineState({ seatId: id })

    const zoom = () => flame.renderSettings.camera.zoom
    const position = () => vec2f(...flame.renderSettings.camera.position)

    const ctx: CommandContext = createSeatCommandContext({
      id,
      flame: () => flame,
      setFlame,
      timeline,
    })

    // Defined after ctx because they dispatch through it; same shape as the
    // workspace's own camera setters, which resolve the updater against the
    // current value so the recorded action carries a concrete number.
    const setZoom = ((value: number | ((previous: number) => number)) => {
      const current = flame.renderSettings.camera.zoom
      const next = clamp(
        typeof value === 'function' ? value(current) : value,
        MIN_CAMERA_ZOOM_VALUE,
        MAX_CAMERA_ZOOM_VALUE,
      )
      executeCommand('flame.setRenderSetting', ctx, 'camera.zoom', next)
      return flame.renderSettings.camera.zoom
    }) as Setter<number>
    const setPosition = ((value: v2f | ((previous: v2f) => v2f)) => {
      const current = vec2f(...flame.renderSettings.camera.position)
      const next = typeof value === 'function' ? value(current) : value
      executeCommand('flame.setRenderSetting', ctx, 'camera.position', [
        next.x,
        next.y,
      ])
      return vec2f(...flame.renderSettings.camera.position)
    }) as Setter<v2f>

    ctx.zoom = zoom
    ctx.setZoom = setZoom
    ctx.position = position
    ctx.setPosition = setPosition

    return {
      id,
      flame: () => flame,
      history,
      timeline,
      stream,
      ctx,
      zoom,
      setZoom,
      position,
      setPosition,
      dispose: () => {
        stream.cancel()
        disposeRoot()
      },
    }
  })
}

/**
 * The CommandContext for a seat with no editor chrome.
 *
 * Same shape the Home portal builds (see components/Home/portalScript.ts),
 * but over a real history and a real timeline. Optional members the workspace
 * fills — `arcade`, `recorder`, `view`, `audio`, `sonification`, `history`,
 * `director`, `arena` — are absent on purpose: a seat has no hub to open, no
 * dock, and no panels, and every command guards on their presence.
 */
export function createSeatCommandContext(seat: {
  id?: SeatId
  flame: Accessor<FlameDescriptor>
  setFlame: HistorySetter<FlameDescriptor>
  timeline: TimelineState
}): CommandContext {
  const { timeline } = seat
  return {
    seatId: seat.id ?? DEFAULT_SEAT,
    flameDescriptor: seat.flame,
    setFlameDescriptor: seat.setFlame,
    blendFlame: () => undefined,
    setBlendFlame: () => {},
    blendWeight: () => 0,
    setBlendWeight: () => {},
    pixelRatio: () => 1,
    setPixelRatio: () => 1,
    // Replaced by `createSeat` with the real camera accessors; a seat built
    // without them still satisfies the interface.
    zoom: () => 1,
    setZoom: () => 1,
    position: () => vec2f(0, 0),
    setPosition: () => vec2f(0, 0),
    sidebar: { open: () => false, setOpen: () => false },
    timeline: {
      tracks: timeline.tracks,
      setTracks: timeline.setTracks,
      animationEnabled: timeline.animationEnabled,
      setAnimationEnabled: timeline.setAnimationEnabled,
      duration: () => timeline.config().endFrame,
      setDuration: (duration, coalesceId) => {
        timeline.updateConfigUndoable({ endFrame: duration }, coalesceId)
      },
      currentFrame: timeline.currentFrame,
      setCurrentFrame: (value: number | ((previous: number) => number)) => {
        const frame =
          typeof value === 'function' ? value(timeline.currentFrame()) : value
        timeline.goToFrame(frame)
        return timeline.currentFrame()
      },
      setPreviewHeld: timeline.setPreviewHeld,
      play: timeline.play,
      setLoop: (loop) => {
        timeline.updateConfigUndoable({ loop })
      },
      setFps: (fps, coalesceId) => {
        timeline.updateConfigUndoable({ fps }, coalesceId)
      },
      addKeyframe: (path, frame, value, easing, interp) => {
        timeline.addKeyframe(
          path,
          frame,
          value,
          easing as Parameters<typeof timeline.addKeyframe>[3],
          interp as Parameters<typeof timeline.addKeyframe>[4],
        )
      },
    },
    camera: {
      center: () => {},
    },
    modal: { open: () => {} },
  }
}
