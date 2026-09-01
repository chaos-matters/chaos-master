import { createSignal, For, Show } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { breedFlames } from '@/flame/breedFlame'
import { mutateFlame } from '@/flame/randomize'
import { Cross, Star } from '@/icons'
import ui from './DirectorOverlay.module.css'
import type { Component } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

export interface DirectorOverlayProps {
  director: NonNullable<CommandContext['director']>
  hardwareTier?: HardwareTier | null
  onClose?: () => void
  respond?: () => void
}

const PREVIEW_RES = { width: 320, height: 180 }

export const DirectorOverlay: Component<DirectorOverlayProps> = (props) => {
  const directorState = () => props.director.state()
  const [selectedIndices, setSelectedIndices] = createSignal<number[]>([])
  const [ratings, setRatings] = createSignal<Record<number, number>>({})
  const [prompt, setPrompt] = createSignal('')
  const [version, setVersion] = createSignal(0)

  const handleClose = () => {
    props.director.setOpen(false)
    props.onClose?.()
    props.respond?.()
  }

  const toggleSelect = (index: number) => {
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    )
  }

  const setRating = (index: number, stars: number) => {
    setRatings((prev) => ({
      ...prev,
      [index]: prev[index] === stars ? 0 : stars,
    }))
  }

  const breedSelectedCandidates = () => {
    const s = directorState()
    if (!s) return
    const sel = selectedIndices()
    const candidates = s.candidates
    if (sel.length < 2) return

    const idx0 = sel[0]
    const idx1 = sel[1]
    if (idx0 === undefined || idx1 === undefined) return

    const parentA = candidates[idx0]?.flame
    const parentB = candidates[idx1]?.flame
    if (!parentA || !parentB) return

    const offspring = breedFlames(parentA, parentB, {
      count: 4,
      crossoverMode: 'uniform',
      mutationStrength: 0.15,
    })

    props.director.setState({
      generation: s.generation + 1,
      candidates: offspring.map((flame, idx) => ({
        fitness: 0.75 + (idx % 3) * 0.08,
        flame,
      })),
    })
    setSelectedIndices([])
    setVersion((v) => v + 1)
  }

  const mutateTopCandidates = () => {
    const s = directorState()
    if (!s) return
    const candidates = s.candidates
    if (candidates.length === 0) return

    const r = ratings()
    let bestIdx = 0
    let bestScore = -1
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i]
      if (cand) {
        const score = (r[i] ?? 0) * 10 + (cand.fitness ?? 0) * 100
        if (score > bestScore) {
          bestScore = score
          bestIdx = i
        }
      }
    }

    const baseFlame = candidates[bestIdx]?.flame
    if (!baseFlame) return

    const newCandidates: { fitness: number; flame: FlameDescriptor }[] = []
    for (let i = 0; i < 4; i++) {
      const mutated = mutateFlame(
        baseFlame,
        {
          strength: 0.2 + i * 0.1,
          minTransforms: 2,
          maxTransforms: 6,
          minVariations: 1,
          maxVariations: 3,
          allowedVariations: [],
          dimensions: baseFlame.renderSettings.dimensions ?? 2,
        },
        {
          mutateAffine: true,
          affineMode: 'smart',
          mutateVariations: 'modify',
          mutateColors: true,
        },
      )
      newCandidates.push({
        fitness: 0.8 + (i % 3) * 0.06,
        flame: mutated,
      })
    }

    props.director.setState({
      generation: s.generation + 1,
      candidates: newCandidates,
    })
    setSelectedIndices([])
    setVersion((v) => v + 1)
  }

  return (
    <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
      <div class={ui.modal} data-testid="art-director-modal">
        {/* Header */}
        <div class={ui.header}>
          <div class={ui.titleGroup}>
            <div class={ui.pulseDot} />
            <h2 class={ui.title}>Evolutionary Art Director</h2>
          </div>
          <div class={ui.headerActions}>
            <Show when={directorState()}>
              {(s) => <span class={ui.genBadge}>Gen {s().generation}</span>}
            </Show>
            <button
              class={ui.closeButton}
              onClick={handleClose}
              aria-label="Close Art Director"
              title="Close Art Director"
            >
              <Cross width="1rem" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div class={ui.body}>
          <Show
            when={directorState()}
            fallback={
              <div
                style={{
                  padding: '40px',
                  'text-align': 'center',
                  color: '#737373',
                }}
              >
                Waiting for candidate generation...
              </div>
            }
          >
            {(state) => (
              <>
                {/* Direction prompt */}
                <div class={ui.promptSection}>
                  <label class={ui.sectionLabel}>Steering Prompt</label>
                  <input
                    type="text"
                    placeholder="e.g. Spiral symmetry, deep violet hues, chaotic curls..."
                    value={prompt()}
                    onInput={(e) => setPrompt(e.currentTarget.value)}
                    class={ui.promptInput}
                  />
                </div>

                {/* Candidates Grid */}
                <div>
                  <div class={ui.candidatesHeader}>
                    <span class={ui.sectionLabel}>
                      Candidates ({state().candidates.length})
                    </span>
                    <span class={ui.hint}>Rate or select to breed</span>
                  </div>

                  <div class={ui.grid}>
                    <For each={state().candidates}>
                      {(candidate, index) => {
                        const isSelected = () =>
                          selectedIndices().includes(index())
                        const rating = () => ratings()[index()] ?? 0

                        return (
                          <div
                            class={ui.card}
                            classList={{ [ui.cardSelected!]: isSelected() }}
                          >
                            <div class={ui.previewThumb}>
                              <Show
                                when={
                                  candidate.flame?.renderSettings?.camera
                                    ? candidate.flame
                                    : null
                                }
                                fallback={
                                  <div class={ui.previewInner}>
                                    <span class={ui.previewLabel}>
                                      Candidate {index() + 1}
                                    </span>
                                  </div>
                                }
                              >
                                {(f) => (
                                  <div class={ui.previewLayer}>
                                    <VariationPreview
                                      version={version()}
                                      isSelected={isSelected()}
                                      flame={f()}
                                      name={`Candidate ${index() + 1}`}
                                      resolution={PREVIEW_RES}
                                      hardwareTier={props.hardwareTier}
                                      snapshotOnly
                                    />
                                  </div>
                                )}
                              </Show>

                              <Show when={candidate.fitness !== undefined}>
                                <div class={ui.fitnessBadge}>
                                  {Math.round((candidate.fitness ?? 0) * 100)}%
                                </div>
                              </Show>

                              <button
                                class={ui.selectCheckbox}
                                classList={{
                                  [ui.selectCheckboxChecked!]: isSelected(),
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleSelect(index())
                                }}
                                title="Select for breeding"
                              >
                                <Show when={isSelected()}>✓</Show>
                              </button>
                            </div>

                            {/* Star Ratings */}
                            <div class={ui.ratingRow}>
                              <div class={ui.stars}>
                                <For each={[1, 2, 3, 4, 5]}>
                                  {(star) => (
                                    <button
                                      class={ui.starBtn}
                                      classList={{
                                        [ui.starBtnActive!]: rating() >= star,
                                      }}
                                      onClick={() => {
                                        setRating(index(), star)
                                      }}
                                      title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                                      aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                                    >
                                      <Star width="0.9rem" height="0.9rem" />
                                    </button>
                                  )}
                                </For>
                              </div>
                              <span class={ui.indexTag}>#{index() + 1}</span>
                            </div>

                            {/* Action Button */}
                            <button
                              class={ui.loadBtn}
                              onClick={() => {
                                props.director.selectCandidate(index())
                                handleClose()
                              }}
                            >
                              Load Candidate
                            </button>
                          </div>
                        )
                      }}
                    </For>
                  </div>
                </div>
              </>
            )}
          </Show>
        </div>

        {/* Footer */}
        <div class={ui.footer}>
          <button
            class={ui.actionBtn}
            disabled={selectedIndices().length < 2}
            onClick={breedSelectedCandidates}
          >
            Breed Selected ({selectedIndices().length})
          </button>
          <button
            class={`${ui.actionBtn} ${ui.actionBtnPrimary}`}
            onClick={mutateTopCandidates}
          >
            Mutate Best
          </button>
        </div>
      </div>
    </ComputeGate>
  )
}
