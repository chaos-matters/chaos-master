import { createSignal, For, onMount } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { generateRandomFlame } from '@/flame/randomize'
import ui from './RandomizerGallery.module.css'
import type { GenerateRandomFlameConfig } from '@/flame/randomize'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

/**
 * A page of N freshly generated random-flame previews. The user picks one to
 * apply instead of click-spamming "Generate" until a good flame appears. Each
 * cell reuses the off-screen {@link VariationPreview} renderer (intersection-
 * gated), so mounting several previews stays cheap.
 */
export function RandomizerGallery(props: {
  /** Builds the generator config from the card's current settings. Re-read on
   *  every re-roll so tweaking settings reflects in the next page. */
  buildConfig: () => GenerateRandomFlameConfig
  hardwareTier?: HardwareTier | null
  onApply: (flame: FlameDescriptor) => void
  /** Number of candidates per page (default 9). */
  count?: number
}) {
  const count = () => props.count ?? 9
  const [candidates, setCandidates] = createSignal<FlameDescriptor[]>([])
  // Bumped on each re-roll so VariationPreview discards its cached image and
  // re-renders the new candidate in that slot.
  const [version, setVersion] = createSignal(0)

  const reroll = () => {
    const config = props.buildConfig()
    setCandidates(
      Array.from({ length: count() }, () => generateRandomFlame(config)),
    )
    setVersion((v) => v + 1)
  }

  onMount(reroll)

  return (
    <div class={ui.gallery}>
      <div class={ui.galleryHeader}>
        <span class={ui.galleryHint}>Pick a flame to apply</span>
        <button
          type="button"
          class={ui.rerollBtn}
          onClick={reroll}
          title="Generate a fresh page of random flames"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class={ui.rerollIcon}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Re-roll
        </button>
      </div>
      <div class={ui.galleryGrid}>
        <For each={candidates()}>
          {(candidate, i) => (
            <button
              type="button"
              class={ui.galleryCell}
              title="Apply this flame"
              onClick={() => {
                props.onApply(candidate)
              }}
            >
              <VariationPreview
                version={version()}
                isSelected={false}
                flame={candidate}
                name={`random-${i()}`}
                hardwareTier={props.hardwareTier ?? null}
              />
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
