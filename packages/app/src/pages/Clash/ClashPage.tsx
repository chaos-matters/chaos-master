/**
 * The Flame Clash preview page (`/clash`): two fighters, one scripted bout.
 *
 * A preview of the new clash, reachable only by its URL: nothing in the
 * editor links here, and nothing here touches the editor's document. The
 * fighters come from the URL (`?a=` and `?b=`, see clashFighters.ts) or the
 * picker, and default to a 3D flame against a 2D one so the flat-card entry
 * shows. `?winner=b` scripts the other outcome.
 */
import { batch, createEffect, createSignal, For, on, onCleanup, onMount, Show, } from 'solid-js'
import { ClashStage } from '@/components/ClashStage/ClashStage'
import { usePrefersReducedMotion } from '@/components/Home/homePlayback'
import { clashFighter, unfitReason } from '@/flame/clash/fightFlame'
import { loadCustomVariations } from '@/flame/variations/custom'
import { fetchGallery } from '@/lib/galleryContent'
import { persistentSignal } from '@/utils/persistentSignal'
import { loadRecentFlames } from '@/utils/recentFlames'
import { DEFAULT_FIGHTERS, exampleOptions, formatFighterRef, galleryOptions, loadFighter, parseFighterRef, recentOptions, } from './clashFighters'
import ui from './ClashPage.module.css'
import { clashQuality } from './clashQuality'
import type { Accessor } from 'solid-js'
import type { FighterOption, FighterRef } from './clashFighters'
import type { Team } from '@/flame/clash/tint'
import type { HardwareTier } from '@/utils/hardwareTier'

type Refs = Record<'a' | 'b', FighterRef>
type Bout = Awaited<ReturnType<typeof loadBout>>

async function loadBout(refs: Refs) {
  const [a, b] = await Promise.all([loadFighter(refs.a), loadFighter(refs.b)])
  if (!a || !b) {
    return { error: `Fighter ${a ? 'B' : 'A'} could not be loaded.` }
  }
  for (const [side, fighter] of [
    ['A', a],
    ['B', b],
  ] as const) {
    const unfit = unfitReason(fighter.flame)
    if (unfit)
      return { error: `${fighter.name} (${side}) cannot fight: ${unfit}.` }
  }
  return {
    fighters: {
      a: clashFighter(a.flame, a.name),
      b: clashFighter(b.flame, b.name),
    },
  }
}

/**
 * The bout for the current fighters, and whether it is loading. Held in
 * signals, not a resource: StandalonePage wraps the page in a Suspense with
 * no fallback, and a resource read under it blanks the whole page, on the
 * first load and on every Fight, instead of saying the fighters are loading.
 * The last bout stays on the stage until the next one is ready.
 */
function createBout(refs: Accessor<Refs>) {
  const [bout, setBout] = createSignal<Bout>()
  const [loading, setLoading] = createSignal(true)
  createEffect(
    on(refs, (next) => {
      let current = true
      onCleanup(() => {
        current = false
      })
      setLoading(true)
      void loadBout(next)
        .catch(() => ({ error: 'The fighters could not be loaded.' }))
        .then((result) => {
          if (!current) return
          batch(() => {
            setBout(result)
            setLoading(false)
          })
        })
    }),
  )
  return { bout, loading }
}

/** Keeps the preview out of search results. */
function markNoIndex() {
  if (document.head.querySelector('meta[name="robots"]')) return
  const meta = document.createElement('meta')
  meta.name = 'robots'
  meta.content = 'noindex'
  document.head.append(meta)
}

export function ClashPage() {
  // The custom variations the editor saved, registered before any fighter
  // is read, so a Recent that uses one fights as it looks in the editor.
  loadCustomVariations()
  const query = new URLSearchParams(window.location.search)
  const winner: Team = query.get('winner') === 'b' ? 'B' : 'A'
  const [refs, setRefs] = createSignal<Refs>({
    a: parseFighterRef(query.get('a')) ?? DEFAULT_FIGHTERS.a,
    b: parseFighterRef(query.get('b')) ?? DEFAULT_FIGHTERS.b,
  })
  const { bout, loading } = createBout(refs)
  const [picking, setPicking] = createSignal(false)

  const prefersReduced = usePrefersReducedMotion()
  const [reducedChoice, setReducedChoice] = createSignal<boolean>()
  const reducedMotion = () => reducedChoice() ?? prefersReduced()

  const [storedTier] = persistentSignal<HardwareTier | null>(
    'hardwareTier',
    null,
  )
  const quality = clashQuality(
    storedTier(),
    globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
  )

  onMount(markNoIndex)

  const names = () => {
    const fighters = bout()?.fighters
    return fighters && { a: fighters.a.name, b: fighters.b.name }
  }

  const fight = (next: Refs) => {
    setPicking(false)
    const url = new URL(window.location.href)
    url.searchParams.set('a', formatFighterRef(next.a))
    url.searchParams.set('b', formatFighterRef(next.b))
    window.history.replaceState(null, '', url)
    setRefs(next)
  }

  return (
    <main class={ui.page}>
      <Show when={bout()?.fighters} keyed>
        {(fighters) => (
          <ClashStage
            a={fighters.a}
            b={fighters.b}
            winner={winner}
            reducedMotion={reducedMotion()}
            renderScale={quality.renderScale}
            pointCountPerBatch={quality.pointCountPerBatch}
            onReducedMotionChange={setReducedChoice}
            onChangeFighters={() => setPicking(true)}
          />
        )}
      </Show>
      <Show when={loading()}>
        <p class={ui.status}>Loading the fighters...</p>
      </Show>
      <Show when={bout()?.error}>
        {(error) => <p class={ui.status}>{error()}</p>}
      </Show>
      <Show when={picking() || bout()?.error !== undefined}>
        <FighterPicker
          current={refs()}
          names={names()}
          onFight={fight}
          onClose={() => setPicking(false)}
        />
      </Show>
    </main>
  )
}

type FighterPickerProps = {
  current: Refs
  /** The current fighters' names, for a fighter no option lists. */
  names?: Record<'a' | 'b', string>
  onFight: (refs: Refs) => void
  onClose: () => void
}

function FighterPicker(props: FighterPickerProps) {
  // A signal, not a resource, for the same reason as the bout: a resource
  // would blank the bout and this picker until the gallery arrives.
  const [gallery, setGallery] = createSignal<FighterOption[]>([])
  onMount(() => {
    void fetchGallery().then(
      (items) => setGallery(galleryOptions(items)),
      // No gallery on this deploy, or offline: offer the rest.
      () => setGallery([]),
    )
  })
  const options = (): FighterOption[] => [
    ...recentOptions(loadRecentFlames()),
    ...exampleOptions(),
    ...gallery(),
  ]
  const groups = () =>
    (['Your flames', 'Examples', 'Gallery'] as const)
      .map((group) => ({
        group,
        options: options().filter((o) => o.group === group),
      }))
      .filter((g) => g.options.length > 0)

  // The fighter each select holds, which Fight takes. The options are built
  // again when the gallery arrives, and each select is set to its choice
  // after that: a value set before its option existed fell back to the first
  // option, and Fight then swapped the fighter.
  const [chosen, setChosen] = createSignal<Record<'a' | 'b', string>>({
    a: formatFighterRef(props.current.a),
    b: formatFighterRef(props.current.b),
  })
  const listed = (value: string) =>
    options().some((o) => formatFighterRef(o.ref) === value)

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const a = parseFighterRef(chosen().a)
    const b = parseFighterRef(chosen().b)
    if (a && b) props.onFight({ a, b })
  }

  const select = (side: 'a' | 'b', label: string) => {
    let element: HTMLSelectElement | undefined
    createEffect(() => {
      const value = chosen()[side]
      groups()
      if (element) element.value = value
    })
    return (
      <label class={ui.field}>
        <span>{label}</span>
        <select
          ref={element}
          name={side}
          onChange={(event) => {
            const value = event.currentTarget.value
            setChosen((current) => ({ ...current, [side]: value }))
          }}
        >
          {/* A fighter no option lists (the gallery still loading, or away)
            shows as itself, so the select says what Fight will take. */}
          <Show when={!listed(chosen()[side])}>
            <option value={chosen()[side]}>
              {props.names?.[side] ?? chosen()[side]}
            </option>
          </Show>
          <For each={groups()}>
            {(g) => (
              <optgroup label={g.group}>
                <For each={g.options}>
                  {(o) => (
                    <option value={formatFighterRef(o.ref)}>{o.label}</option>
                  )}
                </For>
              </optgroup>
            )}
          </For>
        </select>
      </label>
    )
  }

  return (
    <form class={ui.picker} aria-label="Choose the fighters" onSubmit={submit}>
      {select('a', 'Fighter A')}
      {select('b', 'Fighter B')}
      <div class={ui.actions}>
        <button
          type="button"
          class={ui.button}
          onClick={() => {
            props.onClose()
          }}
        >
          Cancel
        </button>
        <button type="submit" class={ui.button} data-primary="">
          Fight
        </button>
      </div>
    </form>
  )
}
