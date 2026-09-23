/**
 * The blend gallery's hover preview, and the pick that commits a partner.
 *
 * Hovering a tile shows the blend at the default weight by writing the
 * document silently: a hover must not reach the undo stack or the recorder.
 * Leaving the tiles puts back exactly what the document had, an absent weight
 * included.
 *
 * A pick ends the preview first and commits second, inside one batch. The
 * order is the point: the history entry the commit pushes then spans the
 * document as it was before the hover, so one undo returns to exactly that,
 * partner and weight alike, where it used to land on the preview. And the
 * pick names its weight, so the step a take records replays to the blend the
 * viewer saw instead of to whatever weight the replay's document held: every
 * gallery pick starts at the default, as the preview shows it, whatever the
 * previous weight was.
 */
import { batch } from 'solid-js'
import { DEFAULT_BLEND_WEIGHT } from '@/flame/blend'
import { deepClone } from '@/utils/clone'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type UseWorkspaceBlendPickParams = {
  /** The workspace document, read when a preview starts. */
  flame: () => FlameDescriptor
  /** The history's silent writer: no entry, no recorder step. */
  setSilently: (fn: (draft: FlameDescriptor) => void) => void
  /** Runs a registered command against the workspace. */
  execute: (id: string, ...args: unknown[]) => void
}

/** What a preview replaced, as stored: an absent field stays absent. The
 *  document keeps its partner unvalidated, so this does too. */
type ReplacedBlend = {
  flame: unknown
  weight: number | undefined
}

export function useWorkspaceBlendPick(params: UseWorkspaceBlendPickParams) {
  let replaced: ReplacedBlend | undefined

  /** Show `flame` as the partner, or end the preview with `null`. */
  function preview(flame: FlameDescriptor | null): void {
    if (flame === null) {
      end()
      return
    }
    // The hover preview IS the blend mechanism, and blending is 2D-only:
    // `ifsPipeline3D.update()` takes a single flame — it has no blend input at
    // all, so `renderSettings.blendFlame` is silently ignored in 3D. Writing it
    // anyway changed the hovered NAME while the picture stayed put, which reads
    // as a broken preview rather than an unsupported one. Skip it instead.
    if ((flame.renderSettings.dimensions ?? 2) === 3) return
    if (replaced === undefined) {
      const { blendFlame, blendWeight } = params.flame().renderSettings
      replaced = {
        flame: blendFlame === undefined ? undefined : deepClone(blendFlame),
        weight: blendWeight,
      }
    }
    params.setSilently((draft) => {
      draft.renderSettings.blendFlame = deepClone(flame)
      draft.renderSettings.blendWeight = DEFAULT_BLEND_WEIGHT
    })
  }

  /** Put back what the preview replaced. Nothing to do without a preview. */
  function end(): void {
    const restore = replaced
    if (restore === undefined) return
    replaced = undefined
    params.setSilently((draft) => {
      if (restore.flame === undefined) delete draft.renderSettings.blendFlame
      else draft.renderSettings.blendFlame = deepClone(restore.flame)
      if (restore.weight === undefined) delete draft.renderSettings.blendWeight
      else draft.renderSettings.blendWeight = restore.weight
    })
  }

  /**
   * Run a commit that follows a preview: the preview ends first, so the
   * commit's history entry starts from the document before the hover. One
   * batch, so nothing renders or rebuilds for the restored state in between.
   */
  function commit(run: () => void): void {
    batch(() => {
      end()
      run()
    })
  }

  /** Commit a partner picked in the gallery, at the weight its preview showed. */
  function pick(flame: FlameDescriptor): void {
    commit(() => {
      params.execute('flame.setBlendFlame', flame, DEFAULT_BLEND_WEIGHT)
    })
  }

  return { preview, end, commit, pick }
}
