import { createSignal, For, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { breedFlames } from '@/flame/breedFlame'
import { mutateFlame } from '@/flame/randomize'
import type { Component } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface DirectorOverlayProps {
  director: NonNullable<CommandContext['director']>
}

export const DirectorOverlay: Component<DirectorOverlayProps> = (props) => {
  const directorState = () => props.director.state()
  const [selectedIndices, setSelectedIndices] = createSignal<number[]>([])
  const [ratings, setRatings] = createSignal<Record<number, number>>({})
  const [prompt, setPrompt] = createSignal('')
  const [version, setVersion] = createSignal(0)

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

    // Pick candidate with highest rating or selection or first
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
    <ComputeGate capacity={2}>
      <Show when={props.director.open()}>
        <Portal>
          <div
            class="pointer-events-none fixed right-4 top-16 bottom-4 w-96 z-50 flex flex-col gap-3 font-sans"
            data-testid="art-director-overlay"
          >
            <div class="pointer-events-auto flex flex-col h-full rounded-2xl border border-emerald-500/20 bg-neutral-950/95 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl text-neutral-200 overflow-hidden">
              {/* Header */}
              <div class="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  <h2 class="text-base font-black uppercase tracking-wider text-emerald-400">
                    Art Director
                  </h2>
                </div>
                <div class="flex items-center gap-3">
                  <Show when={directorState()}>
                    {(s) => (
                      <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-semibold">
                        Gen {s().generation}
                      </span>
                    )}
                  </Show>
                  <button
                    class="rounded-lg px-2 py-1 text-xs text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
                    onClick={() => props.director.setOpen(false)}
                    aria-label="Close Art Director"
                    title="Close Art Director"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Body content */}
              <div class="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 text-sm scrollbar-thin">
                <Show
                  when={directorState()}
                  fallback={
                    <div class="flex flex-col items-center justify-center h-48 text-neutral-500 text-xs italic gap-2">
                      <div class="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
                      <span>Waiting for generation candidates...</span>
                    </div>
                  }
                >
                  {(state) => (
                    <>
                      {/* Direction prompt */}
                      <div class="flex flex-col gap-1.5">
                        <label class="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                          Steering Prompt
                        </label>
                        <div class="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. Add spiral symmetry, neon violet..."
                            value={prompt()}
                            onInput={(e) => setPrompt(e.currentTarget.value)}
                            class="flex-1 bg-neutral-900 border border-neutral-700/60 rounded-lg px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-400 transition-colors"
                          />
                        </div>
                      </div>

                      {/* Candidates Grid */}
                      <div class="flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                          <span class="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                            Candidates ({state().candidates.length})
                          </span>
                          <span class="text-[10px] text-neutral-500">
                            Rate or select to breed
                          </span>
                        </div>

                        <div class="grid grid-cols-2 gap-2.5">
                          <For each={state().candidates}>
                            {(candidate, index) => {
                              const isSelected = () =>
                                selectedIndices().includes(index())
                              const rating = () => ratings()[index()] ?? 0

                              return (
                                <div
                                  class={`group flex flex-col rounded-xl border p-2 transition-all relative ${
                                    isSelected()
                                      ? 'bg-emerald-950/40 border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
                                      : 'bg-neutral-900/70 border-neutral-800 hover:border-neutral-600'
                                  }`}
                                >
                                  {/* Preview Box */}
                                  <div class="relative w-full pb-[56.25%] min-h-[64px] rounded-lg overflow-hidden bg-black border border-white/5">
                                    <Show
                                      when={
                                        candidate.flame?.renderSettings?.camera
                                          ? candidate.flame
                                          : null
                                      }
                                      fallback={
                                        <div class="absolute inset-0 flex items-center justify-center text-xs text-neutral-600">
                                          Flame {index() + 1}
                                        </div>
                                      }
                                    >
                                      {(f) => (
                                        <div class="absolute inset-0">
                                          <VariationPreview
                                            version={version()}
                                            isSelected={isSelected()}
                                            flame={f()}
                                            name={`Candidate ${index() + 1}`}
                                            snapshotOnly
                                          />
                                        </div>
                                      )}
                                    </Show>

                                    {/* Fitness score badge */}
                                    <Show
                                      when={candidate.fitness !== undefined}
                                    >
                                      <div class="absolute top-1 right-1 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                                        {Math.round(
                                          (candidate.fitness ?? 0) * 100,
                                        )}
                                        %
                                      </div>
                                    </Show>

                                    {/* Select for breeding toggle checkbox */}
                                    <button
                                      class={`absolute top-1 left-1 w-4 h-4 rounded flex items-center justify-center text-[10px] border transition-colors ${
                                        isSelected()
                                          ? 'bg-emerald-500 border-emerald-400 text-black font-bold'
                                          : 'bg-black/60 border-white/20 text-transparent hover:border-white/50'
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleSelect(index())
                                      }}
                                      title="Select for breeding"
                                    >
                                      ✓
                                    </button>
                                  </div>

                                  {/* Star Ratings */}
                                  <div class="mt-2 flex items-center justify-between px-1">
                                    <div class="flex items-center gap-0.5">
                                      <For each={[1, 2, 3, 4, 5]}>
                                        {(star) => (
                                          <button
                                            aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                                            class={`text-xs transition-colors ${
                                              rating() >= star
                                                ? 'text-amber-400 hover:text-amber-300'
                                                : 'text-neutral-700 hover:text-neutral-500'
                                            }`}
                                            onClick={() => {
                                              setRating(index(), star)
                                            }}
                                            title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                                          >
                                            ★
                                          </button>
                                        )}
                                      </For>
                                    </div>
                                    <span class="text-[10px] text-neutral-500 font-mono">
                                      #{index() + 1}
                                    </span>
                                  </div>

                                  {/* Action Button */}
                                  <button
                                    class="mt-2 w-full text-center text-xs py-1 px-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40 hover:text-white border border-emerald-500/30 transition-colors font-medium"
                                    onClick={() => {
                                      props.director.selectCandidate(index())
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

                      {/* Evolutionary Action Buttons */}
                      <div class="flex flex-col gap-2 mt-auto pt-3 border-t border-white/10">
                        <div class="grid grid-cols-2 gap-2">
                          <button
                            class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 border border-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={selectedIndices().length < 2}
                            onClick={breedSelectedCandidates}
                            title={
                              selectedIndices().length < 2
                                ? 'Select at least 2 candidates above to breed'
                                : 'Breed selected candidates into new generation'
                            }
                          >
                            Breed Selected ({selectedIndices().length})
                          </button>
                          <button
                            class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 border border-neutral-700 transition-colors"
                            onClick={mutateTopCandidates}
                            title="Mutate highest-rated candidates"
                          >
                            Mutate Best
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </Show>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </ComputeGate>
  )
}
