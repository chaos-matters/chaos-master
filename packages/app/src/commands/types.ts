import type { Accessor, Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { AudioMapping, AudioWiringSnapshot, } from '@/flame/schema/audioWiring'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
import type { TransformColorSnapshot } from '@/recorder/schema'
import type { SonificationSnapshot } from '@/recorder/sonificationState'
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
  /**
   * Live-dispatch boundary invoked before an in-app command mutates any
   * subsystem. The workspace uses it to hand an in-flight timed replay back
   * to the user even for commands that touch only timeline/audio/view state.
   * Replay dispatch deliberately bypasses this hook.
   */
  beforeCommand?: () => void
  flameDescriptor: Accessor<FlameDescriptor>
  setFlameDescriptor: HistorySetter<FlameDescriptor>
  /** Editor-only palette provenance serialized beside replay snapshots. */
  paletteRestoreColors?: Accessor<TransformColorSnapshot>
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
  director?: {
    open: Accessor<boolean>
    setOpen: Setter<boolean>
    state: Accessor<{
      generation: number
      candidates: { fitness?: number; flame?: FlameDescriptor }[]
    } | null>
    setState: Setter<{
      generation: number
      candidates: { fitness?: number; flame?: FlameDescriptor }[]
    } | null>
    selectCandidate: (index: number) => void
  }
  /**
   * Flame Clash Arena HUD. Optional for the same reason as `director?`:
   * sandboxes (the Home portal, the replay video renderer, tests) have no
   * arena, and a required member there is a lie paid for with `as any`.
   */
  arena?: {
    open: Accessor<boolean>
    setOpen: Setter<boolean>
    player1Stats: Accessor<{
      name?: string
      type?: string
      powerLevel?: number
      flame?: FlameDescriptor
      metrics?: {
        complexity?: number
        chaosLevel?: number
        symmetryScore?: number
        energyIntensity?: number
      }
    } | null>
    setPlayer1Stats: Setter<{
      name?: string
      type?: string
      powerLevel?: number
      flame?: FlameDescriptor
      metrics?: {
        complexity?: number
        chaosLevel?: number
        symmetryScore?: number
        energyIntensity?: number
      }
    } | null>
    player2Stats: Accessor<{
      name?: string
      type?: string
      powerLevel?: number
      flame?: FlameDescriptor
      metrics?: {
        complexity?: number
        chaosLevel?: number
        symmetryScore?: number
        energyIntensity?: number
      }
    } | null>
    setPlayer2Stats: Setter<{
      name?: string
      type?: string
      powerLevel?: number
      flame?: FlameDescriptor
      metrics?: {
        complexity?: number
        chaosLevel?: number
        symmetryScore?: number
        energyIntensity?: number
      }
    } | null>
    selectFighter?: (player: 1 | 2) => void
  }
  timeline: {
    tracks: Accessor<TimelineTrack[]>
    setTracks: Setter<TimelineTrack[]>
    animationEnabled: Accessor<boolean>
    setAnimationEnabled: Setter<boolean>
    duration: Accessor<number>
    setDuration: (duration: number, coalesceId?: string) => void
    currentFrame: Accessor<number>
    setCurrentFrame: Setter<number>
    /** Detach a held timeline frame when a replayed camera edit takes over. */
    setPreviewHeld?: Setter<boolean>
    play: () => void
    setLoop: (loop: boolean) => void
    setFps: (fps: number, coalesceId?: string) => void
    setAutoFps?: (enabled: boolean) => void
    setTimeScale?: (scale: number, coalesceId?: string) => void
    addKeyframe: (
      path: string,
      frame: number,
      value: KeyframeValue,
      easing?: string,
      interp?: string,
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
      /** Move without opening another timeline undo entry. Curve dragging
       *  opens its entry at pointer-down and then uses this for each retime. */
      relocateKeyframe?: (path: string, from: number, to: number) => void
      addKeyframeValuesAtFrame?: (
        writes: readonly (readonly [string, KeyframeValue])[],
        frame: number,
        options?: { coalesce?: boolean },
      ) => void
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
   * session. Commands see only the serializable wiring and a yes/no resource
   * authorization supplied by the workspace.
   */
  audio?: {
    snapshot: () => AudioWiringSnapshot
    /**
     * Resource authorization is deliberately supplied by the workspace: the
     * command layer can serialize wiring and a file identity, but it cannot
     * inspect an AudioBuffer or acquire microphone permission. Replayed
     * wiring may become enabled only when this confirms that the matching
     * file (or an already-authorized live analyzer) exists here.
     */
    canEnable: (required: AudioWiringSnapshot) => boolean
    setMapping: (mapping: AudioMapping) => void
    setEnabled: (enabled: boolean) => void
    setSource: (source: 'file' | 'mic') => void
  }
  /**
   * Reproducible Sonification-panel state. AudioContext/device lifetime and
   * the keep-playing preference stay in the workspace, outside session data.
   */
  sonification?: {
    snapshot: () => SonificationSnapshot
    setConfig: (config: SonificationSnapshot['config']) => void
    setEnabled: (enabled: boolean) => void
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

export type ReplayArgsValidator = (
  args: readonly unknown[],
) => string | undefined

export interface FlameCommand {
  id: string
  label: string
  description: string
  /** False for wall-clock/device transport that cannot be serialized. */
  recordable?: boolean
  /**
   * False when a command must never be accepted from an untrusted session.
   * Every other command is still denied unless it declares
   * `validateReplayArgs` or the registry owns an explicit safe signature for
   * its id.
   */
  replayable?: boolean
  /** This command only opens export UI and must not detach the most recently
   *  recorded steps from the document they describe. All other commands are
   *  conservatively treated as replay-state changes. */
  preservesFinishedSession?: boolean
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
   * Validate untrusted session-file arguments before `normalizeArgs` runs.
   * This seam is intentionally separate from execution validation: a
   * normalizer may allocate ids or arrays, so hostile sizes must be rejected
   * before it gets control. Return a short reason, or undefined when valid.
   */
  validateReplayArgs?: ReplayArgsValidator
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
   * Merge a later invocation into the already-recorded gesture action.
   * Most setters simply keep the latest args. Stateful operations such as a
   * keyframe retime need to preserve the gesture's original source frame
   * while updating only its final destination.
   */
  coalesceArgs?: (
    existingArgs: readonly unknown[],
    nextArgs: readonly unknown[],
  ) => unknown[]
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
