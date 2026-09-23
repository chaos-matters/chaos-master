// The registry is global but empty until the builtins register themselves, and
// a sandbox exists precisely to run them. Imported here rather than left to
// each caller so a bare node entry point (scripts/synthesize-steps.mjs) works
// the same as the app.
import '@/commands/builtins'
import { createSignal } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { vec2f } from 'typegpu/data'
import { executeReplayCommand } from '@/commands/registry'
import { APART_FROM_LIVE_GLIDE } from '@/flame/glide/runtime'
import { deepClone } from '@/utils/clone'
import { withRecordingSuppressed } from '../recorder'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'
import type { TimelineTrack } from '@/utils/timeline'

/**
 * A private world one flame lives in, with no DOM, no GPU and no workspace.
 *
 * The planner needs to KNOW what its own steps produce, not guess: every
 * candidate action is run here, through the registry's real replay path, and
 * the result is compared against the target. Reimplementing the commands in a
 * "diff engine" would make the planner's promise ("these steps rebuild this
 * flame") a claim about a second implementation rather than about the app.
 *
 * Same shape as the Home portal's driver (components/Home/portalScript.ts) and
 * for the same reason — `executeReplayCommand(id, ctx, ...)` takes its context
 * as an argument, so the registry is global while the state it writes is
 * entirely ours. Everything the flame commands do not touch is an inert
 * stand-in, and nothing here is wired to the workspace.
 */
export type FlameSandbox = {
  /** The current descriptor. Cloned on read — callers keep it, we keep ours. */
  readonly flame: () => FlameDescriptor
  /**
   * The live document, for reads only. The planner checks a value before and
   * after every step; cloning a large flame twice per step is the difference
   * between a plan and a pause, and nothing it does with the result mutates.
   */
  readonly peek: () => FlameDescriptor
  /**
   * Run one canonical action, exactly as a replayed `.steps.json` would:
   * `preflightReplayCommand` first (unknown command, no replay policy, bad
   * argument shape all refuse), then `execute` with the args as given —
   * `normalizeArgs` is deliberately NOT re-run, because that is what mints
   * fresh ids and is skipped on the replay path too.
   */
  readonly execute: (id: string, args: readonly unknown[]) => boolean
  readonly context: CommandContext
}

export function createFlameSandbox(initial: FlameDescriptor): FlameSandbox {
  const [flame, setFlame] = createStore<FlameDescriptor>(deepClone(initial))

  const startCamera = initial.renderSettings.camera
  const [zoom, setZoom] = createSignal(startCamera.zoom)
  const [position, setPosition] = createSignal(vec2f(...startCamera.position))
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [animationEnabled, setAnimationEnabled] = createSignal(false)
  const [tracks, setTracks] = createSignal<TimelineTrack[]>([])
  const [duration, setDuration] = createSignal(0)
  const [currentFrame, setCurrentFrame] = createSignal(0)
  const [pixelRatio, setPixelRatio] = createSignal(1)
  const [blendFlame, setBlendFlame] = createSignal<FlameDescriptor>()
  const [blendWeight, setBlendWeight] = createSignal(0)

  /**
   * The commands' only way to change the flame — the editor's `HistorySetter`
   * signature without the history. Commands either mutate the draft
   * (`flame.setProbability`) or return a whole replacement (`flame.load`), so
   * both are handled; the `description` a command passes is accepted and
   * ignored, exactly as a history nobody reads would.
   */
  const setFlameDescriptor: HistorySetter<FlameDescriptor> = (setFn) => {
    let replacement: FlameDescriptor | undefined
    setFlame(
      produce((draft: FlameDescriptor) => {
        const next = setFn(draft) as FlameDescriptor | undefined
        if (next !== undefined) replacement = next
      }),
    )
    if (replacement !== undefined) {
      setFlame(reconcile(deepClone(replacement)))
    }
  }

  const context: CommandContext = {
    flameDescriptor: () => flame,
    setFlameDescriptor,
    blendFlame,
    setBlendFlame: (next) => {
      setBlendFlame(() => next)
    },
    blendWeight,
    setBlendWeight,
    pixelRatio,
    setPixelRatio,
    zoom,
    setZoom,
    position,
    setPosition,
    sidebar: { open: sidebarOpen, setOpen: setSidebarOpen },
    timeline: {
      tracks,
      setTracks,
      animationEnabled,
      setAnimationEnabled,
      duration,
      setDuration,
      currentFrame,
      setCurrentFrame,
      play: () => {},
      setLoop: () => {},
      setFps: () => {},
      addKeyframe: () => {},
    },
    camera: {
      center: () => {
        setZoom(1)
        setPosition(vec2f(0, 0))
      },
    },
    modal: { open: () => {} },
    // Nothing here glides, and a take's Glide steps must not reach the
    // viewer's editor while the sandbox checks a plan.
    ...APART_FROM_LIVE_GLIDE,
  }

  return {
    flame: () => deepClone(flame),
    peek: () => flame,
    // The recorder is module-global and survives leaving the workspace, so a
    // planner run while a take is recording must not leak into the user's log.
    execute: (id, args) =>
      withRecordingSuppressed(() =>
        executeReplayCommand(id, context, ...deepClone([...args])),
      ),
    context,
  }
}
