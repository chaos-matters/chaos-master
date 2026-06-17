import { createSignal, onMount } from 'solid-js'
import { useRequestModal } from '@/components/Modal/ModalContext'
import { generateRandomFlame } from '@/flame/randomize'
import { GalleryGrid } from './GalleryGrid'
import ui from './RandomizerGallery.module.css'
import { RandomizerGalleryModal } from './RandomizerGalleryModal'
import galleryModalUi from './RandomizerGalleryModal.module.css'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from '@/flame/randomize'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

const SIDEBAR_GALLERY_COUNT = 9

/**
 * Compact, in-sidebar entry point: a small page of random-flame previews. Click
 * a preview's Apply to use it; Mutate (or the Advanced… button) opens the full
 * gallery modal with larger previews, count selection and mutation breeding.
 */
export function RandomizerGallery(props: {
  /** Builds the generator config from the card's current settings. */
  buildConfig: () => GenerateRandomFlameConfig
  buildMutationOptions: () => MutateFlameOptions
  hardwareTier?: HardwareTier | null
  onApply: (flame: FlameDescriptor) => void
}) {
  const requestModal = useRequestModal()
  const [candidates, setCandidates] = createSignal<FlameDescriptor[]>([])
  const [version, setVersion] = createSignal(0)

  const reroll = () => {
    const config = props.buildConfig()
    setCandidates(
      Array.from({ length: SIDEBAR_GALLERY_COUNT }, () =>
        generateRandomFlame(config),
      ),
    )
    setVersion((v) => v + 1)
  }

  onMount(reroll)

  const openModal = (initialSource?: FlameDescriptor) => {
    void requestModal({
      class: galleryModalUi.dialog,
      content: ({ respond }) => (
        <RandomizerGalleryModal
          buildConfig={props.buildConfig}
          buildMutationOptions={props.buildMutationOptions}
          hardwareTier={props.hardwareTier}
          onApply={props.onApply}
          initialSource={initialSource}
          respond={respond}
        />
      ),
    })
  }

  return (
    <div class={ui.gallery}>
      <div class={ui.galleryHeader}>
        <span class={ui.galleryHint}>Pick a flame to apply</span>
        <div class={ui.galleryActions}>
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
          <button
            type="button"
            class={ui.advancedBtn}
            onClick={() => {
              openModal()
            }}
            title="Open the full gallery: more flames, mutation breeding, bigger previews"
          >
            Advanced…
          </button>
        </div>
      </div>
      <GalleryGrid
        candidates={candidates()}
        version={version()}
        hardwareTier={props.hardwareTier}
        onApply={props.onApply}
        onMutate={(flame) => {
          openModal(flame)
        }}
      />
    </div>
  )
}
