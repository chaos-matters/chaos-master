import { createEffect, createMemo, createSignal, For, onCleanup, Show, } from 'solid-js'
import { clearDuelResult, setDuelCard, setDuelShareUrl, } from '@/arcade/duelResult'
import { Check, Cross, Download, Info, Share, VariationSpiral } from '@/icons'
import { downloadBlob } from '@/utils/blob'
import { addFlameDataToPng } from '@/utils/flameInPng'
import { compressJsonQueryParam } from '@/utils/jsonQueryParam'
import { createShareLink } from '@/utils/shareLink'
import { CARD, CARD_FONTS, CARD_SCALE, CARD_STILL_DEADLINE_MS, cardQuality, drawDuelCard, format, HALF_TRACK, STILL, toCardModel, } from './duelCard'
import ui from './DuelResultCard.module.css'
import { FlameStill } from './FlameStill'
import type { CardRow } from './duelCard'
import type { DuelResult } from '@/arcade/duelResult'

/** Long enough to notice the tick, short enough not to look stuck. */
const COPIED_MS = 1600

/**
 * The winning flame, in a frame, with the numbers that won it.
 *
 * The card is also the export: `drawDuelCard` paints exactly this layout into
 * a canvas at 2x and the flame rides along in a zTXt chunk, so dropping the
 * downloaded PNG back on the app loads the winner. Both readings come from
 * the one `CARD` table in `duelCard.ts` — the DOM boxes below are absolutely
 * positioned from it rather than flowed, because a card that only roughly
 * matches its own PNG is the bug this arrangement exists to prevent.
 *
 * The split screen stays up behind it. Freezing or unmounting the canvases
 * makes the ending read as a crash, and watching the render evolve is the
 * whole appeal of the mode.
 */
export function DuelResultCard(props: {
  result: DuelResult
  /** The viewer's own render quality; the still is clamped from it. */
  quality: number
  onAgain: () => void
}) {
  const [stillUrl, setStillUrl] = createSignal<string>()
  const [bitmap, setBitmap] = createSignal<ImageBitmap>()
  const [copied, setCopied] = createSignal(false)
  const [sharing, setSharing] = createSignal(false)
  const [openInfo, setOpenInfo] = createSignal(false)

  const model = createMemo(() => toCardModel(props.result))
  const verdict = () => props.result.verdict
  const rim = () => model().winner

  const takeStill = (blob: Blob) => {
    setStillUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(blob)
    })
    void globalThis.createImageBitmap(blob).then(setBitmap)
  }
  onCleanup(() => {
    const url = stillUrl()
    if (url) URL.revokeObjectURL(url)
    bitmap()?.close()
  })

  // Composite as soon as the still lands rather than on the first click: the
  // download is then instant, and the share sheet has a file to offer.
  createEffect(() => {
    const still = bitmap()
    if (!still || props.result.card) return
    const id = props.result.id
    void composeCard(model(), still, props.result).then((card) => {
      setDuelCard(id, card)
    })
  })

  const download = () => {
    const card = props.result.card
    if (!card) return
    downloadBlob(card, `duel-${props.result.id}.png`)
  }

  const share = async () => {
    if (sharing()) return
    setSharing(true)
    try {
      const url =
        props.result.shareUrl ??
        (await createShareLink({ flame: props.result.winnerFlame })).primaryUrl
      setDuelShareUrl(props.result.id, url)
      const card = props.result.card
      const file = card
        ? new File([card], `duel-${props.result.id}.png`, {
            type: 'image/png',
          })
        : undefined
      if (file && window.navigator.canShare?.({ files: [file] })) {
        await window.navigator.share({
          files: [file],
          title: 'Lumen Apeiron duel',
          text: verdict().line,
          url,
        })
        return
      }
      try {
        await window.navigator.clipboard.writeText(url)
      } catch {
        // No clipboard permission. `prompt` is the one dialog that hands over
        // a selectable string without putting a 10,000-character URL through
        // the card's layout.
        window.prompt('Copy this link', url)
        return
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      setCopied(false)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div class={ui.layer}>
      <div class={ui.scrim} aria-hidden="true" />
      <section
        class={ui.card}
        classList={{
          [ui.wonPlayer!]: rim() === 'player',
          [ui.wonRival!]: rim() === 'rival',
          [ui.wonDraw!]: rim() === 'draw',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`Duel result: ${verdict().line}`}
      >
        <div class={ui.badge}>
          <VariationSpiral class={ui.badgeGlyph} aria-hidden="true" />
          <span
            class={ui.badgeWord}
            classList={{ [ui.badgeWordLong!]: model().badgeWord.includes(' ') }}
          >
            {model().badgeWord}
          </span>
        </div>

        <header class={ui.titleBar}>
          <h2 class={ui.title}>{model().title}</h2>
        </header>

        <p class={ui.verdict}>{verdict().line}</p>

        <div class={ui.window}>
          <Show
            when={stillUrl()}
            fallback={<span class={ui.spinner} aria-hidden="true" />}
          >
            {(url) => <img class={ui.still} src={url()} alt="" />}
          </Show>
        </div>

        <div class={ui.rows}>
          <For each={model().rows}>{(row) => <StatRow row={row} />}</For>
        </div>

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

      <div class={ui.below}>
        <div class={ui.icons}>
          <button
            type="button"
            class={ui.icon}
            aria-label="Download the card"
            aria-disabled={!props.result.card}
            onClick={download}
          >
            <Download aria-hidden="true" />
          </button>
          <button
            type="button"
            class={ui.icon}
            aria-label="Share the winning flame"
            onClick={() => void share()}
          >
            <Show when={copied()} fallback={<Share aria-hidden="true" />}>
              <Check aria-hidden="true" />
            </Show>
          </button>
          <div class={ui.infoWrap}>
            <button
              type="button"
              class={ui.icon}
              aria-label="How was this scored?"
              aria-expanded={openInfo()}
              onClick={() => setOpenInfo((open) => !open)}
            >
              <Info aria-hidden="true" />
            </button>
            <div class={ui.infoTooltip} role="tooltip">
              <p class={ui.infoIntro}>
                Four measurements, each on a curve that never caps, weighted and
                summed. Chaos and symmetry weigh most.
              </p>
              <For each={verdict().components}>
                {(component) => {
                  const value = () =>
                    rim() === 'rival' ? component.rival : component.player
                  return (
                    <p class={ui.infoLine}>
                      <span>{component.label}</span>
                      <span class={ui.infoSum}>
                        {value().toFixed(1)} × {component.weight} ={' '}
                        {Math.round(value() * component.weight)}
                      </span>
                    </p>
                  )
                }}
              </For>
              <p class={`${ui.infoLine} ${ui.infoTotal}`}>
                <span>Score</span>
                <span class={ui.infoSum}>
                  {rim() === 'rival'
                    ? verdict().rivalScore
                    : verdict().playerScore}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div class={ui.actions}>
          <button type="button" class={ui.action} onClick={props.onAgain}>
            Duel again
          </button>
          <button type="button" class={ui.action} onClick={clearDuelResult}>
            Back to the editor
          </button>
        </div>
      </div>

      {/* Parked out of layout, like the export host's own render: the canvas
          still runs at its full backing store, it is simply never seen. */}
      <Show when={!stillUrl()}>
        <div class={ui.offscreen} aria-hidden="true">
          <FlameStill
            flame={props.result.winnerFlame}
            width={STILL.width}
            height={STILL.height}
            quality={cardQuality(props.quality)}
            deadlineMs={CARD_STILL_DEADLINE_MS}
            onStill={takeStill}
          />
        </div>
      </Show>
    </div>
  )
}

function StatRow(props: { row: CardRow }) {
  const width = (fill: number) =>
    `${Math.max(0, Math.min(1, fill)) * HALF_TRACK}px`
  return (
    <div
      class={ui.row}
      classList={{ [ui.rowHeadline!]: props.row.headline }}
      style={{ height: `${CARD.rows.height}px` }}
    >
      <span
        class={`${ui.fill} ${ui.fillPlayer}`}
        style={{ width: width(props.row.playerFill) }}
        aria-hidden="true"
      />
      <span
        class={`${ui.fill} ${ui.fillRival}`}
        style={{ width: width(props.row.rivalFill) }}
        aria-hidden="true"
      />
      <span class={ui.seam} aria-hidden="true" />
      <span class={`${ui.value} ${ui.valuePlayer}`}>
        {format(props.row.player, props.row.headline)}
      </span>
      <span class={ui.rowLabel}>{props.row.label}</span>
      <span class={`${ui.value} ${ui.valueRival}`}>
        {format(props.row.rival, props.row.headline)}
      </span>
    </div>
  )
}

/**
 * The card as a shareable PNG, with the winning flame inside it twice: once
 * as the picture, once as the `FlameJson` chunk the drop path already reads.
 */
async function composeCard(
  model: ReturnType<typeof toCardModel>,
  still: ImageBitmap,
  result: DuelResult,
): Promise<Blob> {
  // Canvas silently falls back to the default serif for a face it does not
  // have yet, and a card that went out in Times New Roman would never be
  // noticed until someone opened it.
  await Promise.all(CARD_FONTS.map((font) => document.fonts.load(font)))
  const canvas = document.createElement('canvas')
  canvas.width = CARD.width * CARD_SCALE
  canvas.height = CARD.height * CARD_SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context for the duel card')
  drawDuelCard(ctx, model, still, CARD_SCALE, {
    width: still.width,
    height: still.height,
  })
  const png = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png', 1)
  })
  if (!png) throw new Error('could not encode the duel card')
  const encoded = await compressJsonQueryParam(result.winnerFlame)
  return addFlameDataToPng(encoded, new Uint8Array(await png.arrayBuffer()))
}
