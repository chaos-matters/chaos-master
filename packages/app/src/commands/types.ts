import type { Accessor, Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'
import type { TimelineTrack } from '@/utils/timeline'

export interface CommandContext {
  flameDescriptor: Accessor<FlameDescriptor>
  setFlameDescriptor: HistorySetter<FlameDescriptor>
  blendFlame: Accessor<FlameDescriptor | undefined>
  setBlendFlame: (flame: FlameDescriptor | undefined) => void
  blendWeight: Accessor<number>
  setBlendWeight: (weight: number) => void
  pixelRatio: Accessor<number>
  setPixelRatio: Setter<number>
  zoom: Accessor<number>
  setZoom: Setter<number>
  position: Accessor<v2f>
  setPosition: Setter<v2f>
  sidebar: {
    open: Accessor<boolean>
    setOpen: Setter<boolean>
  }
  timeline: {
    tracks: Accessor<TimelineTrack[]>
    setTracks: Setter<TimelineTrack[]>
    animationEnabled: Accessor<boolean>
    setAnimationEnabled: Setter<boolean>
    duration: Accessor<number>
    setDuration: Setter<number>
    currentFrame: Accessor<number>
    setCurrentFrame: Setter<number>
    play: () => void
    setLoop: (loop: boolean) => void
    setFps: (fps: number) => void
    addKeyframe: (
      path: string,
      frame: number,
      value:
        | number
        | string
        | [number, number, number]
        | [number, number, number, number],
      easing?: string,
    ) => void
  }
  camera: {
    center: () => void
  }
  modal: {
    open: (name: string) => void
  }
  /** Chronological undo/redo across flame history + timeline (the undo
   *  router — see utils/undoRouting.ts). Optional: sandboxed contexts (the
   *  Home portal, tests) have no undo systems, and `history.undo`/
   *  `history.redo` are no-ops there. */
  history?: {
    undo: () => void
    redo: () => void
  }
}

export interface FlameCommand {
  id: string
  label: string
  description: string
  shortcut?: string
  /**
   * Resolve args to their canonical, replayable form BEFORE recording and
   * execution: positional transform/variation references become stable ids,
   * ids for to-be-created entities are minted here (never inside a store
   * setter — see createStoreHistory's single-execution contract), and random
   * commands pin a concrete seed. The returned array is what the session
   * recorder logs AND what `execute` receives, so a recorded action replays
   * the exact entities and randomness of the original run.
   */
  normalizeArgs?: (ctx: CommandContext, args: unknown[]) => unknown[]
  execute: (ctx: CommandContext, ...args: unknown[]) => void
}
