import { createEffect, createSignal, Suspense } from 'solid-js'
import { DirectorOverlay } from '@/components/DirectorOverlay'
import { useRequestModal } from '@/components/Modal/ModalContext'
import { scoreFlame as evaluateFlameFitness } from '@/flame/fitness'
import { mutateFlame } from '@/flame/randomize'
import { deepClone } from '@/utils/clone'
import type { Accessor, Setter } from 'solid-js'
import type { DirectorState } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

export interface UseWorkspaceArtDirectorParams {
  flameDescriptor: FlameDescriptor
  setFlameDescriptor: (
    updater: (draft: FlameDescriptor) => FlameDescriptor,
    label?: string,
  ) => void
  showToast: (message: string) => void
  hardwareTier?: (() => HardwareTier | null | undefined) | HardwareTier | null
}

export function useWorkspaceArtDirector(params: UseWorkspaceArtDirectorParams) {
  const { flameDescriptor, setFlameDescriptor, showToast, hardwareTier } =
    params

  const [directorOpen, setDirectorOpen] = createSignal(false)
  const [directorState, setDirectorState] = createSignal<DirectorState | null>(
    null,
  )
  const requestModal = useRequestModal()

  const selectCandidate = (index: number) => {
    const s = directorState()
    if (s && s.candidates[index]?.flame) {
      const candidateFlame = s.candidates[index].flame
      setFlameDescriptor(
        () => deepClone(candidateFlame),
        `Art Director: Candidate ${index + 1}`,
      )
      setDirectorState({
        ...s,
        lastFeedback: {
          ...s.lastFeedback,
          selectedIndex: index,
          candidates: s.candidates.map((c, i) => ({
            index: i,
            reaction: c.reaction ?? null,
            tags: c.tags ?? [],
            rationale: c.rationale,
          })),
        },
      })
      showToast(`Art Director: Loaded candidate ${index + 1} into workspace.`)
    }
  }

  let isDirectorModalOpen = false

  function openArtDirectorUI() {
    if (isDirectorModalOpen) return
    isDirectorModalOpen = true
    const s = directorState()
    if (!s || s.candidates.length === 0) {
      const current = deepClone(flameDescriptor)
      const presets = ['Subtle', 'Moderate', 'Chaotic', 'Structural'] as const
      const candidates = presets.map((_, i) => {
        const mutated = mutateFlame(
          current,
          {
            strength: 0.2 + i * 0.1,
            minTransforms: 2,
            maxTransforms: 6,
            minVariations: 1,
            maxVariations: 3,
            allowedVariations: [],
            dimensions: current.renderSettings.dimensions ?? 2,
          },
          {
            mutateAffine: true,
            affineMode: 'smart',
            mutateVariations: 'modify',
            mutateColors: true,
          },
        )
        return {
          fitness: evaluateFlameFitness(mutated).composite,
          flame: mutated,
        }
      })
      setDirectorState({
        generation: 1,
        candidates,
      })
    }
    setDirectorOpen(true)
    void requestModal({
      content: ({ respond }) => (
        <Suspense>
          <DirectorOverlay
            director={{
              open: directorOpen,
              setOpen: setDirectorOpen,
              state: directorState,
              setState: setDirectorState,
              selectCandidate,
            }}
            hardwareTier={
              typeof hardwareTier === 'function' ? hardwareTier() : hardwareTier
            }
            respond={() => {
              isDirectorModalOpen = false
              setDirectorOpen(false)
              respond()
            }}
          />
        </Suspense>
      ),
    }).finally(() => {
      isDirectorModalOpen = false
      setDirectorOpen(false)
    })
  }

  createEffect(() => {
    if (directorOpen() && !isDirectorModalOpen) {
      openArtDirectorUI()
    }
  })

  return {
    directorOpen,
    setDirectorOpen,
    directorState,
    setDirectorState,
    selectCandidate,
    openArtDirectorUI,
  }
}

export type WorkspaceArtDirectorHandle = {
  directorOpen: Accessor<boolean>
  setDirectorOpen: Setter<boolean>
  directorState: Accessor<DirectorState | null>
  setDirectorState: Setter<DirectorState | null>
  selectCandidate: (index: number) => void
  openArtDirectorUI: () => void
}
