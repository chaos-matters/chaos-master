import { createEffect, createMemo, createSignal, onCleanup, Show, } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { exportFlameXml } from '@/flame/flameXml'
import { collectFlameCustomVariations } from '@/flame/variations/custom'
import { deriveOgMeta, encodeShareUrl, shortenShareUrl, uploadOgPreview, } from '@/utils/shareLink'
import { Button } from '../Button/Button'
import { Checkbox } from '../Checkbox/Checkbox'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './ShareLink.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

const { navigator } = globalThis

/**
 * Keep in sync with the Worker's `SHORTEN_TTL` (currently 60 days). Short `?s=`
 * links are stored in KV and evicted after this window; the full `?flame=` link
 * carries the data inline and never expires.
 */
const SHORT_LINK_TTL_DAYS = 60

type ShareLinkModalProps = {
  flameDescriptor: FlameDescriptor
  tracks: TimelineTrack[]
  config: TimelineConfig
  hasAnimation: boolean
  captureOgImage?: () => Promise<Blob | null>
  respond: () => void
}

function ShareLinkModal(props: ShareLinkModalProps) {
  const { showToast } = useToast()
  const [includeAnimation, setIncludeAnimation] = createSignal(
    props.hasAnimation,
  )
  // Custom (user-authored) variations the flame references. Included by default
  // so the shared link actually renders — without them the recipient would see
  // the flame with those variations silently dropped.
  const customVariations = createMemo(() =>
    collectFlameCustomVariations(props.flameDescriptor),
  )
  const hasCustomVariations = () => customVariations().length > 0
  const [includeCustomVariations, setIncludeCustomVariations] =
    createSignal(true)
  const sharedCustomVariations = () =>
    includeCustomVariations() && hasCustomVariations()
      ? customVariations()
      : undefined
  // The full, self-contained `?flame=` link (carries all data, never expires)
  // and the optional shortened `?s=` link (nicer to share, but expires).
  const [longUrl, setLongUrl] = createSignal('')
  const [shortUrl, setShortUrl] = createSignal('')
  const [copied, setCopied] = createSignal(false)

  // Prefer the short link for display/auto-copy; fall back to the full link
  // when the shortener is unavailable.
  const primaryUrl = () => shortUrl() || longUrl()
  const hasShortLink = () => shortUrl() !== ''

  // Track the "Copied!" reset timer so it can't fire after the modal closes
  // (a no-op write on a disposed scope) and so rapid re-copies don't stack.
  let copiedResetTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    clearTimeout(copiedResetTimer)
  })

  async function copyToClipboard(text: string) {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    clearTimeout(copiedResetTimer)
    copiedResetTimer = setTimeout(() => setCopied(false), 2000)
  }

  createEffect(() => {
    const include = includeAnimation()
    const customVars = sharedCustomVariations()
    void (async () => {
      const { encoded, longUrl } = await encodeShareUrl({
        flame: props.flameDescriptor,
        animation:
          include && props.tracks.length > 0
            ? { tracks: props.tracks, config: props.config }
            : undefined,
        customVariations: customVars,
      })

      // Surface the full link immediately so there's always something to copy,
      // even while the shortener request is in flight or if it fails.
      setLongUrl(longUrl)
      setShortUrl('')

      const short = await shortenShareUrl(encoded)
      if (short) setShortUrl(short)

      // Upload the preview keyed by content hash, regardless of whether the
      // shortener succeeded — so the ?flame= fallback link gets the same card.
      void props.captureOgImage?.().then((blob) => {
        if (!blob) return
        const { title, description } = deriveOgMeta(props.flameDescriptor)
        void uploadOgPreview({ encoded, blob, title, description })
      })

      await copyToClipboard(primaryUrl())
    })()
  })

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        Share Link
      </ModalTitleBar>
      <div class={ui.content}>
        <label
          class={ui.toggleField}
          classList={{ [ui.toggleDisabled as string]: !props.hasAnimation }}
        >
          <Checkbox
            checked={includeAnimation()}
            onChange={setIncludeAnimation}
          />
          <span>Include Animation</span>
        </label>
        <Show when={hasCustomVariations()}>
          <label class={ui.toggleField}>
            <Checkbox
              checked={includeCustomVariations()}
              onChange={setIncludeCustomVariations}
            />
            <span>
              Include {customVariations().length} custom variation
              {customVariations().length === 1 ? '' : 's'}
            </span>
          </label>
        </Show>
        <textarea
          class={ui.textarea}
          value={primaryUrl()}
          readOnly
          title="Click to copy"
          rows={primaryUrl().length > 100 ? 4 : 1}
          onClick={(e) => {
            e.currentTarget.select()
            void copyToClipboard(primaryUrl())
          }}
        />
        <p class={ui.note}>
          <Show
            when={hasShortLink()}
            fallback={
              <>
                This full link carries the flame data inline, so it never
                expires.
              </>
            }
          >
            Short link copied. It expires after {SHORT_LINK_TTL_DAYS} days — for
            a permanent link use <strong>Copy full link</strong> (it carries the
            flame data inline).
          </Show>
        </p>
        <Show when={copied()}>
          <div class={ui.copiedMsg}>Copied to clipboard!</div>
        </Show>
      </div>
      <footer class={ui.footer}>
        <Button
          onClick={() => {
            props.respond()
          }}
        >
          Close
        </Button>
        <Show when={hasShortLink()}>
          <Button onClick={() => void copyToClipboard(longUrl())}>
            Copy full link
          </Button>
        </Show>
        <Button
          onClick={async () => {
            const customVars = sharedCustomVariations()
            const withAnimation = includeAnimation() && props.tracks.length > 0
            const payload =
              withAnimation || customVars
                ? {
                    flame: props.flameDescriptor,
                    ...(withAnimation && {
                      animation: {
                        tracks: props.tracks,
                        config: props.config,
                      },
                    }),
                    ...(customVars && { customVariations: customVars }),
                  }
                : props.flameDescriptor
            await copyToClipboard(JSON.stringify(payload))
          }}
        >
          Copy JSON
        </Button>
        <Show
          when={(props.flameDescriptor.renderSettings.dimensions ?? 2) === 2}
        >
          <Button
            onClick={() => {
              // flam3/Apophysis interop: export the (2D) flame as a .flame XML
              // so it can be opened in Apophysis/flam3. Animation is omitted —
              // the .flame format carries a single static flame.
              void copyToClipboard(
                exportFlameXml(
                  props.flameDescriptor,
                  props.flameDescriptor.metadata?.name,
                ),
              )
              // Custom variations can't be represented in .flame — let the user
              // know they were left out of the export.
              const n = customVariations().length
              if (n > 0) {
                showToast(
                  `${n} custom variation${n === 1 ? '' : 's'} omitted from the flam3 XML — no Apophysis/flam3 equivalent.`,
                )
              }
            }}
          >
            Copy flam3 XML
          </Button>
        </Show>
      </footer>
    </>
  )
}

export function createShareLinkModal(
  flameDescriptor: FlameDescriptor,
  getTracks: () => TimelineTrack[],
  getConfig: () => TimelineConfig,
  captureOgImage?: () => Promise<Blob | null>,
) {
  const requestModal = useRequestModal()

  async function showShareLinkModal() {
    const tracks = getTracks()
    const config = getConfig()
    const hasAnimation = tracks.length > 0

    await requestModal({
      class: ui.container,
      content: ({ respond }) => (
        <ShareLinkModal
          flameDescriptor={flameDescriptor}
          tracks={tracks}
          config={config}
          hasAnimation={hasAnimation}
          captureOgImage={captureOgImage}
          respond={respond}
        />
      ),
    })
  }

  return { showShareLinkModal }
}
