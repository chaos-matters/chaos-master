import { createSignal, For, Show } from 'solid-js'
import { clearDuelResult } from '@/arcade/duelResult'
import { Check, Copy, Cross, VariationSpiral } from '@/icons'
import { createShareLink } from '@/utils/shareLink'
import ui from './DuelResultCard.module.css'
import type { DuelResult } from '@/arcade/duelResult'

/** Long enough to read "Copied", short enough not to look stuck. */
const COPIED_MS = 1600

function clock(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The verdict, over the two flames that earned it.
 *
 * The split screen stays up behind this. Freezing or unmounting the canvases
 * makes the ending read as a crash, and watching the render evolve is the
 * whole appeal of the mode — so both keep rendering and the card is backed by
 * a scrim instead.
 *
 * The champion-card mock is a single-flame trading card; three of its regions
 * do not survive contact with a two-sided result. Its art window is redundant
 * when both flames are live behind the card, so the frozen dial takes that
 * slot; its HP plaque is replaced by the ring and the two numerals; and its
 * one-sided stat bars become tug-of-war bars, because a one-sided bar cannot
 * say who won a component.
 */
export function DuelResultCard(props: {
  result: DuelResult
  onAgain: () => void
}) {
  const [link, setLink] = createSignal<string>()
  const [copied, setCopied] = createSignal(false)
  const [working, setWorking] = createSignal(false)
  const [showMaths, setShowMaths] = createSignal(false)

  const verdict = () => props.result.verdict
  const won = () => verdict().winner
  const total = () => verdict().playerScore + verdict().rivalScore
  const playerShare = () =>
    total() === 0 ? 0.5 : verdict().playerScore / total()

  const winnerName = () =>
    won() === 'rival' ? props.result.rivalTitle : props.result.playerTitle

  const share = async () => {
    if (working()) return
    setWorking(true)
    try {
      const existing = link()
      const url =
        existing ??
        (await createShareLink({ flame: props.result.winnerFlame })).primaryUrl
      setLink(url)
      await window.navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      // No clipboard permission, or the worker is unreachable and encoding
      // failed. The URL, if we got one, is on screen to copy by hand.
      setCopied(false)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div class={ui.layer}>
      <div class={ui.scrim} aria-hidden="true" />
      <section
        class={ui.card}
        classList={{
          [ui.wonPlayer!]: won() === 'player',
          [ui.wonRival!]: won() === 'rival',
          [ui.wonDraw!]: won() === 'draw',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`Duel result: ${verdict().line}`}
      >
        <div class={ui.badge}>
          <VariationSpiral class={ui.badgeGlyph} aria-hidden="true" />
          <span class={ui.badgeWord}>
            {won() === 'draw' ? 'Draw' : won() === 'player' ? 'You' : 'AI'}
          </span>
        </div>

        <header class={ui.titleBar}>
          <h2 class={ui.title}>
            {won() === 'draw'
              ? `${props.result.playerTitle} · ${props.result.rivalTitle}`
              : winnerName()}
          </h2>
        </header>

        <p class={ui.verdict}>{verdict().line}</p>

        <div class={ui.pills}>
          <For each={verdict().components}>
            {(component) => {
              const sum = () => component.player + component.rival
              const left = () =>
                sum() === 0 ? 50 : (component.player / sum()) * 100
              return (
                <div class={ui.pill}>
                  <span
                    class={`${ui.pillFill} ${ui.pillFillPlayer}`}
                    style={{ width: `${left() / 2}%` }}
                    aria-hidden="true"
                  />
                  <span
                    class={`${ui.pillFill} ${ui.pillFillRival}`}
                    style={{ width: `${(100 - left()) / 2}%` }}
                    aria-hidden="true"
                  />
                  <span class={`${ui.pillValue} ${ui.pillValuePlayer}`}>
                    {component.player.toFixed(1)}
                  </span>
                  <span class={ui.pillName}>{component.label}</span>
                  <span class={`${ui.pillValue} ${ui.pillValueRival}`}>
                    {component.rival.toFixed(1)}
                  </span>
                </div>
              )
            }}
          </For>
        </div>

        <div class={ui.dialRow}>
          <span class={`${ui.score} ${ui.scorePlayer}`}>
            {verdict().playerScore}
          </span>
          <div class={ui.dial}>
            <svg viewBox="0 0 200 200" class={ui.dialSvg} aria-hidden="true">
              <circle cx="100" cy="100" r="88" class={ui.dialPlate} />
              <circle cx="100" cy="100" r="82" class={ui.dialBezel} />
              {/* One closed loop split where the lead sits: the same idea the
                  live HUD draws, frozen at the final score. */}
              <circle
                cx="100"
                cy="100"
                r="82"
                class={ui.dialWarm}
                stroke-dasharray={`${playerShare() * 515} 515`}
                transform="rotate(-90 100 100)"
              />
              <circle
                cx="100"
                cy="100"
                r="82"
                class={ui.dialCool}
                stroke-dasharray={`${(1 - playerShare()) * 515} 515`}
                transform={`rotate(${-90 + playerShare() * 360} 100 100)`}
              />
            </svg>
            <div class={ui.dialReadout}>
              <span class={ui.dialClock}>{clock(props.result.durationMs)}</span>
              <span class={ui.dialLabel}>duel length</span>
            </div>
          </div>
          <span class={`${ui.score} ${ui.scoreRival}`}>
            {verdict().rivalScore}
          </span>
        </div>

        <div class={ui.captions}>
          <span class={ui.captionPlayer}>Your flame</span>
          <span class={ui.captionRival}>The AI's flame</span>
        </div>

        <div class={ui.chips}>
          <span class={ui.chip}>{props.result.archetype}</span>
          <span class={ui.chip}>
            {props.result.reason === 'finished' ? 'Time up' : 'Ended early'}
          </span>
          <span class={ui.chip}>Duel {props.result.id}</span>
        </div>

        <div class={ui.shareRow}>
          <span class={ui.shareUrl}>{link() ?? 'Share the winning flame'}</span>
          <button
            type="button"
            class={ui.shareButton}
            onClick={() => void share()}
            disabled={working()}
          >
            <Show when={copied()} fallback={<Copy aria-hidden="true" />}>
              <Check aria-hidden="true" />
            </Show>
            {copied() ? 'Copied' : working() ? 'Linking…' : 'Copy link'}
          </button>
        </div>

        <button
          type="button"
          class={ui.maths}
          aria-expanded={showMaths()}
          onClick={() => setShowMaths((open) => !open)}
        >
          {showMaths() ? 'Hide the maths' : 'How was this scored?'}
        </button>
        <Show when={showMaths()}>
          <div class={ui.mathsPanel}>
            <p class={ui.mathsIntro}>
              Four measurements, each on a curve that never caps, weighted and
              summed. More always counts for something, so a flame can keep
              gaining until the buzzer.
            </p>
            <For each={verdict().components}>
              {(component) => (
                <p class={ui.mathsLine}>
                  <span class={ui.mathsName}>{component.label}</span>
                  <span class={ui.mathsDetail}>{component.detail}</span>
                  <span class={ui.mathsWeight}>
                    {component.player.toFixed(1)} × {component.weight} ={' '}
                    {Math.round(component.player * component.weight)}
                  </span>
                </p>
              )}
            </For>
          </div>
        </Show>

        <p class={ui.watermark}>Lumen Apeiron</p>

        <button
          type="button"
          class={ui.close}
          aria-label="Close the result"
          onClick={clearDuelResult}
        >
          <Cross aria-hidden="true" />
        </button>
      </section>

      <div class={ui.actions}>
        <button type="button" class={ui.action} onClick={props.onAgain}>
          Duel again
        </button>
        <button type="button" class={ui.action} onClick={clearDuelResult}>
          Back to the editor
        </button>
      </div>
    </div>
  )
}
