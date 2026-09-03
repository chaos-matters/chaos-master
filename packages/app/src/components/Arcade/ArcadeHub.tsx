import { createEffect, createSignal, For, onCleanup, onMount, Show, } from 'solid-js'
import { Book, Film, Lineage, MusicNote, Swords, Zap } from '@/icons'
import { arcadeMode, setActiveTab } from '@/lib/activeTab'
import ui from './ArcadeHub.module.css'
import { ArcadeModePanel } from './ArcadeModePanel'
import { WebMcpStatusPill } from './WebMcpStatusPill'
import type { Component } from 'solid-js'
import type { ArcadeMode } from '@/lib/activeTab'

type CardId = ArcadeMode | 'arena' | 'director'
type CardDef = {
  id: CardId
  title: string
  tagline: string
  tag: string
  ready: boolean
  icon: Component<{ class?: string }>
}

export const ARCADE_MODES: CardDef[] = [
  {
    id: 'teach',
    title: 'Teach',
    tagline:
      'The AI builds a flame step by step and records a lesson you can replay.',
    tag: 'AI drives',
    ready: true,
    icon: Book,
  },
  {
    id: 'cinema',
    title: 'Cinema',
    tagline:
      'Describe a move; the AI keyframes a cinematic animation of your flame.',
    tag: 'AI drives',
    ready: true,
    icon: Film,
  },
  {
    id: 'duel',
    title: 'Duel',
    tagline: 'Race the AI to the better flame, side by side against the clock.',
    tag: 'You + AI',
    ready: true,
    icon: Swords,
  },
  {
    id: 'beats',
    title: 'Beats',
    tagline: 'The AI wires your flame to a song so it dances.',
    tag: 'AI drives',
    ready: false,
    icon: MusicNote,
  },
  {
    id: 'arena',
    title: 'Arena',
    tagline: 'Flames clash on real stats; the winner gets a shareable card.',
    tag: 'Roadmap',
    ready: false,
    icon: Zap,
  },
  {
    id: 'director',
    title: 'Director',
    tagline: 'The AI learns your taste and evolves flames toward it.',
    tag: 'Roadmap',
    ready: false,
    icon: Lineage,
  },
]

export function ArcadeHub(props: {
  initialMode?: ArcadeMode
  onBackToEditor: () => void
}) {
  const [open, setOpen] = createSignal<ArcadeMode | undefined>(
    props.initialMode,
  )
  createEffect(() => setOpen(arcadeMode()))
  onMount(() => {
    // Esc on the hub root leaves for the editor. With a panel open the panel
    // handles Esc itself and stops the event, so this never sees it.
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || open()) return
      props.onBackToEditor()
    }
    document.addEventListener('keydown', onKey)
    onCleanup(() => {
      document.removeEventListener('keydown', onKey)
    })
  })
  return (
    <section class={ui.hub} aria-label="Lumen Arcade">
      <header class={ui.header}>
        <h1 class={ui.wordmark}>Lumen Arcade</h1>
        <p class={ui.promise}>
          Hand the controls to an AI. It builds, teaches, animates. You watch,
          replay, and keep everything.
        </p>
        <WebMcpStatusPill />
      </header>
      <div class={ui.grid}>
        <For each={ARCADE_MODES}>
          {(card) => (
            <button
              type="button"
              class={ui.card}
              classList={{ [ui.cardDisabled!]: !card.ready }}
              data-testid="arcade-card"
              data-mode={card.id}
              disabled={!card.ready}
              aria-disabled={!card.ready}
              onClick={() => {
                if (card.ready) {
                  setActiveTab('arcade', card.id as ArcadeMode)
                }
              }}
            >
              <div class={ui.art} data-mode={card.id}>
                <card.icon class={ui.artIcon} />
              </div>
              <div class={ui.cardTitle}>{card.title}</div>
              <div class={ui.cardTagline}>{card.tagline}</div>
              <div class={ui.cardTag}>{card.ready ? card.tag : 'Roadmap'}</div>
            </button>
          )}
        </For>
      </div>
      <footer class={ui.footer}>
        <button type="button" onClick={props.onBackToEditor}>
          Back to editor
        </button>
        <a
          href="https://github.com/chaos-matters/chaos-master/blob/main/docs/webmcp.md"
          target="_blank"
          rel="noreferrer"
        >
          How it works
        </a>
      </footer>
      <Show when={open()}>
        {(mode) => (
          <ArcadeModePanel
            mode={mode()}
            onClose={() => {
              setActiveTab('arcade')
            }}
          />
        )}
      </Show>
    </section>
  )
}
