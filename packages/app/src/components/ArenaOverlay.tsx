import { Show } from 'solid-js'
import { CloseIcon } from '@/ui/icons/CloseIcon'
import { FlameIcon } from '@/ui/icons/FlameIcon'
import type { Component} from 'solid-js';
import type { CommandContext } from '@/commands/types'

export interface ArenaOverlayProps {
  arena: CommandContext['arena']
}

export const ArenaOverlay: Component<ArenaOverlayProps> = (props) => {
  return (
    <Show when={props.arena.open()}>
      <div
        class="pointer-events-none absolute inset-0 z-50 flex flex-col justify-between"
        style={{
          background:
            'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.6) 100%)',
        }}
      >
        {/* Top Bar: Title & Close Button */}
        <div class="pointer-events-auto flex items-center justify-between bg-black/80 p-4 text-white shadow-[0_4px_20px_rgba(255,100,0,0.2)]">
          <div class="flex items-center gap-3">
            <FlameIcon class="h-8 w-8 text-orange-500" />
            <h1 class="text-2xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-600">
              Flame Clash Arena
            </h1>
          </div>
          <button
            class="rounded bg-white/10 p-2 hover:bg-red-500/50 transition"
            onClick={() => props.arena.setOpen(false)}
          >
            <CloseIcon class="h-6 w-6" />
          </button>
        </div>

        {/* Player Stats Side-by-Side */}
        <div class="flex w-full justify-between px-8 pb-12">
          {/* Player 1 (Left) */}
          <Show when={props.arena.player1Stats()}>
            {(p1) => (
              <div class="w-80 rounded-xl bg-black/70 p-6 backdrop-blur-md border border-cyan-500/30 shadow-[0_0_30px_rgba(0,255,255,0.1)] text-cyan-50">
                <h2 class="text-3xl font-bold uppercase text-cyan-400 mb-2">
                  {p1().name}
                </h2>
                <div class="mb-4 text-sm font-semibold tracking-wider text-cyan-200/70 uppercase">
                  Class: {p1().type || 'Unknown'}
                </div>

                <div class="space-y-4">
                  <StatBar
                    label="Power Level"
                    value={p1().powerLevel || 0}
                    max={2000}
                    color="bg-cyan-500"
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
          <div class="flex flex-col items-center justify-end pb-8">
            <div class="text-6xl font-black italic text-white drop-shadow-[0_0_20px_rgba(255,0,0,0.8)]">
              VS
            </div>
          </div>

          {/* Player 2 (Right) */}
          <Show when={props.arena.player2Stats()}>
            {(p2) => (
              <div class="w-80 rounded-xl bg-black/70 p-6 backdrop-blur-md border border-orange-500/30 shadow-[0_0_30px_rgba(255,100,0,0.1)] text-orange-50">
                <h2 class="text-3xl font-bold uppercase text-orange-400 mb-2 text-right">
                  {p2().name}
                </h2>
                <div class="mb-4 text-sm font-semibold tracking-wider text-orange-200/70 uppercase text-right">
                  Class: {p2().type || 'Unknown'}
                </div>

                <div class="space-y-4">
                  <StatBar
                    label="Power Level"
                    value={p2().powerLevel || 0}
                    max={2000}
                    color="bg-orange-500"
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
    </Show>
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
