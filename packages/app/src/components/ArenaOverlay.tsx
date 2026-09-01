import { createSignal, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { Zap } from '@/icons'
import type { Component } from 'solid-js'
import type { CommandContext } from '@/commands/types'

export interface ArenaOverlayProps {
  arena: CommandContext['arena']
}

export const ArenaOverlay: Component<ArenaOverlayProps> = (props) => {
  const [commentary, setCommentary] = createSignal<string | null>(null)
  const [winner, setWinner] = createSignal<1 | 2 | null>(null)
  const [clashing, setClashing] = createSignal(false)

  const handleClash = () => {
    const p1 = props.arena.player1Stats()
    const p2 = props.arena.player2Stats()
    if (!p1 || !p2) return

    setClashing(true)
    setCommentary(
      'Fighters engaging... Calculating resonance and fractal entropy!',
    )

    setTimeout(() => {
      const p1Power =
        (p1.powerLevel ?? 1000) + (p1.metrics?.complexity ?? 5) * 50
      const p2Power =
        (p2.powerLevel ?? 1000) + (p2.metrics?.chaosLevel ?? 5) * 50

      if (p1Power >= p2Power) {
        setWinner(1)
        setCommentary(
          `${p1.name ?? 'Player 1'} dominates the arena with superior structural resonance! (Power: ${Math.round(p1Power)})`,
        )
      } else {
        setWinner(2)
        setCommentary(
          `${p2.name ?? 'Player 2'} overwhelms with pure chaotic energy! (Power: ${Math.round(p2Power)})`,
        )
      }
      setClashing(false)
    }, 900)
  }

  const loadFighter = (player: 1 | 2) => {
    if (props.arena.selectFighter) {
      props.arena.selectFighter(player)
    }
  }

  return (
    <ComputeGate capacity={2}>
      <Show when={props.arena.open()}>
        <Portal>
          <div
            class="pointer-events-none fixed inset-0 z-50 flex flex-col justify-between font-sans"
            style={{
              background:
                'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.85) 100%)',
            }}
            data-testid="flame-clash-arena-overlay"
          >
            {/* Top Bar: Title & Close Button */}
            <div class="pointer-events-auto flex items-center justify-between bg-black/85 backdrop-blur-md px-6 py-4 text-white border-b border-orange-500/20 shadow-[0_4px_30px_rgba(255,100,0,0.15)]">
              <div class="flex items-center gap-3">
                <span class="inline-block w-3 h-3 rounded-full bg-gradient-to-r from-orange-400 to-red-500 animate-ping" />
                <h1 class="text-2xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-orange-400 to-red-500">
                  Flame Clash Arena
                </h1>
              </div>
              <div class="flex items-center gap-3">
                <button
                  class="rounded-lg bg-neutral-800/80 px-3 py-1.5 text-xs text-neutral-300 hover:bg-red-600 hover:text-white border border-neutral-700 transition-colors font-medium"
                  onClick={() => props.arena.setOpen(false)}
                >
                  Exit Arena
                </button>
              </div>
            </div>

            {/* Center Commentary & Clash Controller */}
            <div class="pointer-events-auto flex flex-col items-center justify-center gap-3 px-4 my-auto z-10">
              <Show when={commentary()}>
                {(msg) => (
                  <div class="max-w-xl text-center px-5 py-2.5 rounded-xl bg-black/90 border border-amber-500/40 text-amber-300 text-sm font-semibold shadow-[0_0_20px_rgba(245,158,11,0.2)] backdrop-blur-lg animate-fade-in">
                    {msg()}
                  </div>
                )}
              </Show>

              <button
                class={`pointer-events-auto px-8 py-3 rounded-2xl font-black text-lg uppercase tracking-widest shadow-2xl transition-all ${
                  clashing()
                    ? 'bg-neutral-800 text-neutral-400 scale-95 cursor-wait'
                    : 'bg-gradient-to-r from-cyan-500 via-amber-500 to-red-500 hover:scale-105 text-black hover:shadow-[0_0_30px_rgba(245,158,11,0.6)] cursor-pointer'
                }`}
                onClick={handleClash}
                disabled={clashing()}
              >
                {clashing() ? (
                  'CLASHING...'
                ) : (
                  <div class="flex items-center justify-center gap-2">
                    <Zap class="w-6 h-6" />
                    <span>CLASH FLAMES</span>
                    <Zap class="w-6 h-6" />
                  </div>
                )}
              </button>
            </div>

            {/* Player Stats Side-by-Side */}
            <div class="pointer-events-auto flex w-full justify-between px-8 pb-10 gap-6 items-end">
              {/* Player 1 (Left / Cyan) */}
              <Show when={props.arena.player1Stats()}>
                {(p1) => (
                  <div
                    class={`w-96 rounded-2xl bg-neutral-950/85 p-5 backdrop-blur-xl border transition-all ${
                      winner() === 1
                        ? 'border-cyan-400 shadow-[0_0_40px_rgba(6,182,212,0.4)] scale-102'
                        : 'border-cyan-500/30 shadow-[0_0_25px_rgba(6,182,212,0.1)]'
                    } text-cyan-50 flex flex-col gap-3`}
                  >
                    {/* Fighter Preview */}
                    <div class="relative w-full pb-[56.25%] min-h-[80px] rounded-xl overflow-hidden bg-black border border-cyan-500/30">
                      <Show
                        when={
                          p1().flame?.renderSettings?.camera ? p1().flame : null
                        }
                        fallback={
                          <div class="absolute inset-0 flex items-center justify-center text-xs text-cyan-500/50">
                            {p1().name ?? 'Player 1'}
                          </div>
                        }
                      >
                        {(f) => (
                          <div class="absolute inset-0">
                            <VariationPreview
                              version={0}
                              isSelected={winner() === 1}
                              flame={f()}
                              name={p1().name ?? 'Player 1'}
                              snapshotOnly
                            />
                          </div>
                        )}
                      </Show>
                      <Show when={winner() === 1}>
                        <div class="absolute top-2 left-2 bg-cyan-400 text-black px-2 py-0.5 rounded-full font-black text-xs uppercase tracking-wider shadow-lg">
                          VICTOR
                        </div>
                      </Show>
                    </div>

                    <div class="flex items-center justify-between">
                      <div>
                        <h2 class="text-2xl font-black uppercase tracking-wide text-cyan-400">
                          {p1().name ?? 'Fighter 1'}
                        </h2>
                        <div class="text-[11px] font-bold tracking-wider text-cyan-200/70 uppercase">
                          Class: {p1().type || 'Fractal Guardian'}
                        </div>
                      </div>
                      <Show when={p1().flame}>
                        <button
                          class="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40 text-xs font-semibold border border-cyan-500/30 transition-colors"
                          onClick={() => {
                            loadFighter(1)
                          }}
                        >
                          Load Flame
                        </button>
                      </Show>
                    </div>

                    <div class="space-y-2.5 mt-1 border-t border-cyan-500/20 pt-3">
                      <StatBar
                        label="Power Level"
                        value={p1().powerLevel || 0}
                        max={2000}
                        color="bg-cyan-400"
                      />
                      <StatBar
                        label="Complexity"
                        value={(p1().metrics?.complexity || 0) * 10}
                        max={100}
                        color="bg-blue-400"
                      />
                      <StatBar
                        label="Chaos Level"
                        value={(p1().metrics?.chaosLevel || 0) * 10}
                        max={100}
                        color="bg-purple-400"
                      />
                      <StatBar
                        label="Symmetry"
                        value={(p1().metrics?.symmetryScore || 0) * 10}
                        max={100}
                        color="bg-indigo-400"
                      />
                      <StatBar
                        label="Energy"
                        value={(p1().metrics?.energyIntensity || 0) * 10}
                        max={100}
                        color="bg-teal-400"
                      />
                    </div>
                  </div>
                )}
              </Show>

              {/* VS Center Graphic */}
              <div class="flex flex-col items-center justify-center pb-8">
                <div class="text-5xl font-black italic text-white drop-shadow-[0_0_25px_rgba(245,158,11,0.8)] tracking-tighter">
                  VS
                </div>
              </div>

              {/* Player 2 (Right / Orange) */}
              <Show when={props.arena.player2Stats()}>
                {(p2) => (
                  <div
                    class={`w-96 rounded-2xl bg-neutral-950/85 p-5 backdrop-blur-xl border transition-all ${
                      winner() === 2
                        ? 'border-orange-400 shadow-[0_0_40px_rgba(249,115,22,0.4)] scale-102'
                        : 'border-orange-500/30 shadow-[0_0_25px_rgba(249,115,22,0.1)]'
                    } text-orange-50 flex flex-col gap-3`}
                  >
                    {/* Fighter Preview */}
                    <div class="relative w-full pb-[56.25%] min-h-[80px] rounded-xl overflow-hidden bg-black border border-orange-500/30">
                      <Show
                        when={
                          p2().flame?.renderSettings?.camera ? p2().flame : null
                        }
                        fallback={
                          <div class="absolute inset-0 flex items-center justify-center text-xs text-orange-500/50">
                            {p2().name ?? 'Player 2'}
                          </div>
                        }
                      >
                        {(f) => (
                          <div class="absolute inset-0">
                            <VariationPreview
                              version={0}
                              isSelected={winner() === 2}
                              flame={f()}
                              name={p2().name ?? 'Player 2'}
                              snapshotOnly
                            />
                          </div>
                        )}
                      </Show>
                      <Show when={winner() === 2}>
                        <div class="absolute top-2 right-2 bg-orange-400 text-black px-2 py-0.5 rounded-full font-black text-xs uppercase tracking-wider shadow-lg">
                          VICTOR
                        </div>
                      </Show>
                    </div>

                    <div class="flex items-center justify-between">
                      <Show when={p2().flame}>
                        <button
                          class="px-2.5 py-1 rounded-lg bg-orange-500/20 text-orange-300 hover:bg-orange-500/40 text-xs font-semibold border border-orange-500/30 transition-colors"
                          onClick={() => {
                            loadFighter(2)
                          }}
                        >
                          Load Flame
                        </button>
                      </Show>
                      <div class="text-right">
                        <h2 class="text-2xl font-black uppercase tracking-wide text-orange-400">
                          {p2().name ?? 'Fighter 2'}
                        </h2>
                        <div class="text-[11px] font-bold tracking-wider text-orange-200/70 uppercase">
                          Class: {p2().type || 'Chaos Lord'}
                        </div>
                      </div>
                    </div>

                    <div class="space-y-2.5 mt-1 border-t border-orange-500/20 pt-3">
                      <StatBar
                        label="Power Level"
                        value={p2().powerLevel || 0}
                        max={2000}
                        color="bg-orange-400"
                        rightAlign
                      />
                      <StatBar
                        label="Complexity"
                        value={(p2().metrics?.complexity || 0) * 10}
                        max={100}
                        color="bg-red-400"
                        rightAlign
                      />
                      <StatBar
                        label="Chaos Level"
                        value={(p2().metrics?.chaosLevel || 0) * 10}
                        max={100}
                        color="bg-pink-400"
                        rightAlign
                      />
                      <StatBar
                        label="Symmetry"
                        value={(p2().metrics?.symmetryScore || 0) * 10}
                        max={100}
                        color="bg-yellow-400"
                        rightAlign
                      />
                      <StatBar
                        label="Energy"
                        value={(p2().metrics?.energyIntensity || 0) * 10}
                        max={100}
                        color="bg-amber-400"
                        rightAlign
                      />
                    </div>
                  </div>
                )}
              </Show>
            </div>
          </div>
        </Portal>
      </Show>
    </ComputeGate>
  )
}

function StatBar(props: {
  label: string
  value: number
  max: number
  color: string
  rightAlign?: boolean
}) {
  const percentage = Math.min(100, Math.max(0, (props.value / props.max) * 100))

  return (
    <div
      class={`flex flex-col ${props.rightAlign ? 'items-end' : 'items-start'}`}
    >
      <div class="mb-1 flex w-full justify-between text-xs font-bold uppercase tracking-wider text-white/70">
        <span class={props.rightAlign ? 'order-2' : ''}>{props.label}</span>
        <span class={props.rightAlign ? 'order-1' : ''}>
          {Math.round(props.value)}
        </span>
      </div>
      <div
        class={`h-2 w-full rounded-full bg-black/50 overflow-hidden ${props.rightAlign ? 'rotate-180' : ''}`}
      >
        <div
          class={`h-full rounded-full ${props.color} transition-all duration-1000 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
