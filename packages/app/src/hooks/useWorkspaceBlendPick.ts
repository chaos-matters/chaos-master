/**
 * The partner gallery's hover preview, and the pick that commits a partner.
 *
 * A hover shows a child of the two flames for Breed, the blend for Blend and
 * Morph in 2D, and nothing for Evolve and Diff, which never use a blend (the
 * tile's name still shows over the canvas, as it does over a preview shown).
 *
 * Hovering a tile writes the document silently: a hover must not reach the
 * undo stack or the recorder. Leaving the tiles puts back exactly what the
 * document had, an absent weight included, and so does every other way out:
 * the gallery ends its preview however it goes away, when Home or the Arcade
 * covers it and when the page is hidden (BlendFlameGallery), an Evolve or
 * Diff pick ends it before the view it opens reads the document
 * (WorkspaceSidebar), and MainWorkspace ends it before every undo and redo.
 * Putting back happens only while the document still holds what the preview
 * wrote: a load or a replay under a resting pointer drops the preview
 * instead. Autosave stores `withoutPreview`, never the hover.
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
import { batch, createSignal } from 'solid-js'
import { unwrap } from 'solid-js/store'
import { DEFAULT_BLEND_WEIGHT } from '@/flame/blend'
import { breedFlames } from '@/flame/breedFlame'
import { stableStringify } from '@/recorder/synthesize/canonical'
import { deepClone } from '@/utils/clone'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/** Which picker the gallery is serving. */
export type BlendIntent = 'blend' | 'morph' | 'breed' | 'evolve' | 'diff'

/**
 * How long a candidate must stay hovered before its child is rendered.
 *
 * Slightly longer than the gallery's own 120ms clear delay: a child has a
 * different transform structure from its parent, so showing one rebuilds the
 * IFS pipeline, and sweeping the pointer down a list must not do that once
 * per tile.
 */
export const BREED_PREVIEW_DELAY_MS = 220

export type UseWorkspaceBlendPickParams = {
  /** The workspace document, read when a preview starts. */
  flame: () => FlameDescriptor
  /** The history's silent writer: no entry, no recorder step. */
  setSilently: (fn: (draft: FlameDescriptor) => void) => void
  /** Runs a registered command against the workspace. */
  execute: (id: string, ...args: unknown[]) => void
  /** Which picker the gallery is serving; a blend when omitted. */
  intent?: () => BlendIntent
}

/** What a preview replaced, as stored: an absent field stays absent. The
 *  document keeps its partner unvalidated, so this does too. */
type ReplacedBlend = {
  flame: unknown
  weight: number | undefined
}

/** The fields a blend preview writes. Key order aside: the store keeps a
 *  partner's keys in the order its writes left them. */
function blendFields(flame: FlameDescriptor): string {
  const { blendFlame, blendWeight } = unwrap(flame).renderSettings
  return stableStringify({ blendFlame, blendWeight })
}

/** What a breed preview is recognised by. Not the render settings, which the
 *  3D auto-exposure rewrites under a showing child (useWorkspaceCamera). */
function breedFields(flame: FlameDescriptor): string {
  const { transforms, metadata } = unwrap(flame)
  return stableStringify({ transforms, metadata })
}

const in3D = (flame: FlameDescriptor) => flame.renderSettings.dimensions === 3

/** Put back what a blend preview replaced. */
function putBack(
  settings: FlameDescriptor['renderSettings'],
  restore: ReplacedBlend,
): void {
  if (restore.flame === undefined) delete settings.blendFlame
  else settings.blendFlame = deepClone(restore.flame)
  if (restore.weight === undefined) delete settings.blendWeight
  else settings.blendWeight = restore.weight
}

export function useWorkspaceBlendPick(params: UseWorkspaceBlendPickParams) {
  const intent = params.intent ?? (() => 'blend' as const)
  let replaced: ReplacedBlend | undefined
  /** The blend fields the preview wrote, to recognise them by. Signals, like
   *  the child's, so the badge follows what the canvas shows. */
  const [blendShown, setBlendShown] = createSignal<string>()

  /**
   * The child generated for whichever candidate is hovered, so clicking opens
   * the breed gallery on the flame you were actually looking at rather than
   * nine unrelated ones.
   */
  const [breedChild, setBreedChild] = createSignal<FlameDescriptor | undefined>(
    undefined,
  )
  /** The workspace flame as it was before a breed preview replaced it. */
  let breedRestore: FlameDescriptor | undefined
  /** The child the breed preview wrote, to recognise it by. */
  const [breedShown, setBreedShown] = createSignal<string>()
  let breedTimer: ReturnType<typeof setTimeout> | undefined

  /** The document still shows the blend the preview wrote. */
  const holdsBlend = () =>
    blendShown() !== undefined && blendFields(params.flame()) === blendShown()
  /** The document still shows the child the breed preview wrote. */
  const holdsBreed = () =>
    breedShown() !== undefined && breedFields(params.flame()) === breedShown()

  /** Forget a preview the document no longer shows: what it replaced is stale. */
  function dropStale(): void {
    if (replaced !== undefined && !holdsBlend()) {
      replaced = undefined
      setBlendShown(undefined)
    }
    if (breedRestore !== undefined && !holdsBreed()) {
      breedRestore = undefined
      setBreedShown(undefined)
      setBreedChild(undefined)
    }
  }

  function writeDescriptor(next: FlameDescriptor) {
    const value = deepClone(next)
    params.setSilently((draft) => {
      draft.version = value.version
      draft.metadata = value.metadata
      draft.renderSettings = value.renderSettings
      draft.transforms = value.transforms
    })
  }

  /** Put back the flame a breed preview replaced, if the child is still
   *  what the document shows. */
  function endBreed(): void {
    clearTimeout(breedTimer)
    breedTimer = undefined
    dropStale()
    setBreedChild(undefined)
    if (breedRestore !== undefined) {
      writeDescriptor(breedRestore)
      breedRestore = undefined
      setBreedShown(undefined)
    }
  }

  /**
   * Hovering a candidate while breeding shows an actual CHILD of the two
   * flames, not a 40% blend of them.
   *
   * A blend is the wrong thing to show here twice over: it is not what
   * breeding produces, and it cannot render at all in 3D — `ifsPipeline3D`
   * has no blend input, so the old preview changed the hovered NAME while the
   * picture sat still. A real child works in both dimensions, because
   * `breedFlames` carries `variations3D`.
   *
   * Debounced, and this matters: a child has a different transform STRUCTURE
   * from its parent, so applying one rebuilds the IFS pipeline. Sweeping the
   * pointer across a list must not rebuild once per tile.
   */
  function previewBreedChild(flame: FlameDescriptor): void {
    clearTimeout(breedTimer)
    breedTimer = setTimeout(() => {
      dropStale()
      const parentA = breedRestore ?? unwrap(params.flame())
      const [child] = breedFlames(parentA, flame, {
        count: 1,
        crossoverMode: 'uniform',
        mutationStrength: 0.1,
      })
      if (child === undefined) {
        return
      }
      // Snapshot once per hover run, not per tile: the restore target is the
      // flame the user arrived with, never a previously previewed child.
      breedRestore ??= deepClone(unwrap(params.flame()))
      setBreedChild(child)
      writeDescriptor(child)
      setBreedShown(breedFields(params.flame()))
    }, BREED_PREVIEW_DELAY_MS)
  }

  /**
   * The gallery's hover, and `null` ends it. Each kind ends the other first:
   * the intent can change inside the gallery's clear delay, and a breed that
   * started over a live blend crossed it into parent A.
   */
  function preview(flame: FlameDescriptor | null): void {
    const serving = intent()
    if (flame === null || serving === 'evolve' || serving === 'diff') {
      endBreed()
      endBlend()
    } else if (serving === 'breed') {
      endBlend()
      previewBreedChild(flame)
    } else {
      endBreed()
      previewBlend(flame)
    }
  }

  /** Show `flame` as the blend partner. */
  function previewBlend(flame: FlameDescriptor): void {
    // The hover preview IS the blend mechanism, and blending is 2D-only:
    // `ifsPipeline3D.update()` takes a single flame — it has no blend input at
    // all, so `renderSettings.blendFlame` is silently ignored in 3D, whichever
    // of the two flames is 3D. So nothing is written, the last tile's preview
    // ends, and no badge names a blend the canvas does not show.
    if (in3D(flame) || in3D(params.flame())) {
      endBlend()
      return
    }
    dropStale()
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
    setBlendShown(blendFields(params.flame()))
  }

  /** Put back what the blend preview replaced, if the document still shows
   *  the preview. Nothing to do without one. */
  function endBlend(): void {
    dropStale()
    const restore = replaced
    if (restore === undefined) return
    replaced = undefined
    setBlendShown(undefined)
    params.setSilently((draft) => {
      putBack(draft.renderSettings, restore)
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

  /** End whatever hover preview is showing. */
  function end(): void {
    endBreed()
    endBlend()
  }

  /** The document as a save stores it, with any hover preview taken off.
   *  Reads only; the preview stays on screen. */
  function withoutPreview(): FlameDescriptor {
    if (breedRestore !== undefined && holdsBreed()) return breedRestore
    if (replaced === undefined || !holdsBlend()) return params.flame()
    const saved = deepClone(unwrap(params.flame()))
    putBack(saved.renderSettings, replaced)
    return saved
  }

  /** Name the hovered tile, or `null` for none: the gallery calls it after
   *  `preview`. */
  const [hovered, name] = createSignal<string | null>(null)
  /** The name the badge over the canvas shows: only while the tile's preview
   *  is on the canvas, which a blend in 3D never is. Evolve and Diff preview
   *  nothing, and their badge says what a click does. */
  const badge = () =>
    ['evolve', 'diff'].includes(intent()) ||
    (intent() === 'breed' ? holdsBreed() : holdsBlend())
      ? hovered()
      : null

  return { preview, end, breedChild, commit, pick, withoutPreview, badge, name }
}
