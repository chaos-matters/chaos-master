import type { Accessor, Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { AudioMapping, AudioWiringSnapshot, } from '@/flame/schema/audioWiring'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
import type { HistorySetter } from '@/utils/createStoreHistory'
import type { TimelineTrack } from '@/utils/timeline'
import type { UndoTarget } from '@/utils/undoRouting'

/** What a keyframe can hold. Mirrors the timeline's own union. */
type KeyframeValue =
  | number
  | string
  | [number, number, number]
  | [number, number, number, number]

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
      value: KeyframeValue,
      easing?: string,
    ) => void
    /**
     * The rest of the keyframe verbs. Optional as a group because sandboxed
     * contexts (the Home portal, tests) build a minimal timeline stub, and a
     * required member there would be a lie — a command guards on presence
     * rather than crashing a preview.
     */
    edit?: {
      removeKeyframe: (path: string, frame: number) => void
      setKeyframeValue: (
        path: string,
        frame: number,
        value: KeyframeValue,
        easing?: string,
        interp?: string,
      ) => void
      setKeyframeInterp: (path: string, frame: number, interp: string) => void
      moveKeyframe: (path: string, from: number, to: number) => void
      removeTrack: (path: string) => void
      clearTracks: () => void
      setLoopMode: (mode: 'off' | 'seamless' | 'cycle') => void
      setAutoKeyframe: (on: boolean) => void
      /** Whole timeline in and out — how a session snapshots its starting
       *  animation and how a replay restores it. */
      snapshot: () => TimelineSnapshot
      load: (data: TimelineSnapshot) => void
    }
  }
  /**
   * Audio-reactive wiring. Optional for the same reason as `timeline.edit`.
   * The audio BUFFER is deliberately absent: it cannot be recorded into a
   * session, so no command may depend on it.
   */
  audio?: {
    snapshot: () => AudioWiringSnapshot
    setMapping: (mapping: AudioMapping) => void
    setEnabled: (enabled: boolean) => void
    setSource: (source: 'file' | 'mic') => void
  }
  /**
   * Viewport and render-pipeline switches — the things in the actions toolbar
   * that change what you see without touching the document. They are not part
   * of the flame, so nothing else records them.
   */
  view?: {
    setQualityPreset: (key: string) => void
    setAdaptiveFilter: (on: boolean) => void
    setStochasticFilter: (on: boolean) => void
    setFlyMode: (on: boolean) => void
    setShowTimeline: (shown: boolean) => void
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
   *  `history.redo` are no-ops there. The peeks report what undo/redo WOULD
   *  apply, which is how the session recorder decides whether the operation
   *  is replayable from its log. */
  history?: {
    undo: () => void
    redo: () => void
    peekUndoTarget?: () => UndoTarget | undefined
    peekRedoTarget?: () => UndoTarget | undefined
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
  /**
   * Identifies "the same control being set again" for value-setting commands,
   * computed from normalized args (e.g. the parameter path, or
   * transform+affine+coefficient). Repeats within one gesture fold into a
   * single recorded action carrying the final value, so a slider drag logs
   * one step rather than the hundred `onInput` events it fires. Leave unset
   * for commands whose repeats are each meaningful.
   */
  coalesceKey?: (args: unknown[]) => string | undefined
  /**
   * A label for THIS invocation, from its normalized args, used by the
   * recorder in place of the static `label`. Generic commands need it:
   * every render-setting edit would otherwise read "Set Render Setting" in a
   * replay step list, where "Set gamma" is the point.
   */
  describe?: (args: unknown[]) => string | undefined
  /**
   * Follow-cam hint for THIS invocation — what the replay should look at while
   * the step runs (see recorder/focus.ts for the grammar). Most commands need
   * nothing here: the central table in that module derives the hint from the
   * id and args. Declare it only when the args alone do not say what changed.
   */
  focus?: (args: unknown[]) => string | undefined
  execute: (ctx: CommandContext, ...args: unknown[]) => void
}
