import { createEffect, createSignal, Show } from 'solid-js'
import { encodeSharePayload } from '@/utils/jsonQueryParam'
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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip the `data:image/png;base64,` prefix
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => {
      reject(new Error('Failed to read blob'))
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * Content-addressed key for the OG image — must match the Worker's `ogKey`
 * (SHA-256 of the encoded payload, first 32 hex chars) so `?flame=` and `?s=`
 * links resolve the same stored image.
 */
async function ogKey(encoded: string): Promise<string> {
  const data = new TextEncoder().encode(encoded)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

function deriveOgMeta(flame: FlameDescriptor): {
  title: string
  description: string
} {
  const meta = flame.metadata
  const name = meta?.name?.trim()
  const author = meta?.author
  const title = name
    ? name
    : author && author !== 'unknown'
      ? `Flame by ${author}`
      : 'Fractal Flame — Chaos Master'
  const transformCount = Object.keys(flame.transforms ?? {}).length
  const description = meta?.description?.trim()
    ? meta.description.trim()
    : `${transformCount} transform${transformCount === 1 ? '' : 's'} • Created with Chaos Master`
  return { title, description }
}

function ShareLinkModal(props: ShareLinkModalProps) {
  const [includeAnimation, setIncludeAnimation] = createSignal(
    props.hasAnimation,
  )
  // The full, self-contained `?flame=` link (carries all data, never expires)
  // and the optional shortened `?s=` link (nicer to share, but expires).
  const [longUrl, setLongUrl] = createSignal('')
  const [shortUrl, setShortUrl] = createSignal('')
  const [copied, setCopied] = createSignal(false)

  // Prefer the short link for display/auto-copy; fall back to the full link
  // when the shortener is unavailable.
  const primaryUrl = () => shortUrl() || longUrl()
  const hasShortLink = () => shortUrl() !== ''

  async function copyToClipboard(text: string) {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /**
   * Render the current flame to a PNG and attach it to the short link so social
   * crawlers show a rich preview. Runs in the background — the link is already
   * usable; the image just needs to land before the first crawler scrape.
   */
  async function uploadOgPreview(encoded: string) {
    try {
      const blob = await props.captureOgImage?.()
      if (!blob) return
      const image = await blobToBase64(blob)
      const { title, description } = deriveOgMeta(props.flameDescriptor)
      await fetch(`/api/og/${await ogKey(encoded)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, title, description }),
      })
    } catch (err) {
      console.error('Failed to upload OG preview image:', err)
    }
  }

  createEffect(() => {
    const include = includeAnimation()
    void (async () => {
      const encoded = await encodeSharePayload(
        props.flameDescriptor,
        include && props.tracks.length > 0
          ? { tracks: props.tracks, config: props.config }
          : undefined,
      )

      // Surface the full link immediately so there's always something to copy,
      // even while the shortener request is in flight or if it fails.
      setLongUrl(`${window.location.origin}/?flame=${encoded}`)
      setShortUrl('')

      try {
        const res = await fetch('/api/shorten', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ payload: encoded }),
        })

        if (res.ok) {
          const json = await res.json()
          if (json.id) {
            setShortUrl(`${window.location.origin}/?s=${json.id}`)
          }
        }
      } catch (err) {
        console.error('Failed to shorten URL:', err)
      }

      // Upload the preview keyed by content hash, regardless of whether the
      // shortener succeeded — so the ?flame= fallback link gets the same card.
      void uploadOgPreview(encoded)

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
            const payload =
              includeAnimation() && props.tracks.length > 0
                ? {
                    flame: props.flameDescriptor,
                    animation: { tracks: props.tracks, config: props.config },
                  }
                : props.flameDescriptor
            await copyToClipboard(JSON.stringify(payload))
          }}
        >
          Copy JSON
        </Button>
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
