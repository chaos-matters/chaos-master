import { For, Show } from 'solid-js'
import type { Component } from 'solid-js'
import type { CommandContext } from '@/commands/types'

export interface DirectorOverlayProps {
  director: NonNullable<CommandContext['director']>
}

export const DirectorOverlay: Component<DirectorOverlayProps> = (props) => {
  const directorState = () => props.director.state()

  return (
    <Show when={props.director.open()}>
      <div class="pointer-events-none absolute right-4 top-20 bottom-4 w-80 z-40 flex flex-col gap-4">
        <div class="pointer-events-auto flex flex-col rounded-xl border border-white/10 bg-black/80 p-4 shadow-2xl backdrop-blur-md">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-xl font-bold uppercase tracking-widest text-emerald-400">
              Art Director
            </h2>
            <button
              class="rounded hover:bg-white/10 p-1 transition-colors text-gray-400 hover:text-white"
              onClick={() => props.director.setOpen(false)}
            >
              Close
            </button>
          </div>

          <div class="flex flex-col gap-4 text-sm text-gray-300">
            <Show
              when={directorState()}
              fallback={
                <div class="italic text-gray-500">
                  Waiting for generation...
                </div>
              }
            >
              {(state) => (
                <>
                  <div class="flex justify-between border-b border-white/10 pb-2">
                    <span class="font-medium">Generation</span>
                    <span class="text-emerald-400 font-bold">
                      {state().generation}
                    </span>
                  </div>

                  <div class="flex flex-col gap-2">
                    <span class="font-medium text-white">Candidates:</span>
                    <div class="grid grid-cols-2 gap-2">
                      <For each={state().candidates}>
                        {(candidate: { fitness?: number }, index) => (
                          <div class="flex flex-col items-center gap-1 rounded bg-white/5 p-2 border border-white/5 cursor-pointer hover:border-emerald-400/50 transition-colors pointer-events-auto">
                            <div class="h-16 w-full bg-black rounded overflow-hidden flex items-center justify-center text-xs text-gray-500 relative">
                              Flame {index() + 1}
                              <Show when={candidate.fitness !== undefined}>
                                <div class="absolute bottom-1 right-1 bg-black/80 px-1 text-[10px] text-emerald-400 rounded">
                                  {Math.round((candidate.fitness ?? 0) * 100)}%
                                </div>
                              </Show>
                            </div>
                            <button
                              class="w-full text-center text-xs bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40 rounded py-1"
                              onClick={() => {
                                props.director.selectCandidate(index())
                              }}
                            >
                              Select
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </>
              )}
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}
