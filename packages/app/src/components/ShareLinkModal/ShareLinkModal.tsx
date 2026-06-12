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

type ShareLinkModalProps = {
  flameDescriptor: FlameDescriptor
  tracks: TimelineTrack[]
  config: TimelineConfig
  hasAnimation: boolean
  respond: () => void
}

function ShareLinkModal(props: ShareLinkModalProps) {
  const [includeAnimation, setIncludeAnimation] = createSignal(
    props.hasAnimation,
  )
  const [url, setUrl] = createSignal('')
  const [copied, setCopied] = createSignal(false)

  createEffect(() => {
    const include = includeAnimation()
    void (async () => {
      const encoded = await encodeSharePayload(
        props.flameDescriptor,
        include && props.tracks.length > 0
          ? { tracks: props.tracks, config: props.config }
          : undefined,
      )

      let newUrl = `${window.location.origin}/?flame=${encoded}`

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
            newUrl = `${window.location.origin}/?s=${json.id}`
          }
        }
      } catch (err) {
        console.error('Failed to shorten URL:', err)
      }

      setUrl(newUrl)
      await navigator.clipboard.writeText(newUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
          value={url()}
          readOnly
          title="Click to copy"
          rows={url().length > 100 ? 4 : 1}
          onClick={async (e) => {
            e.currentTarget.select()
            await navigator.clipboard.writeText(url())
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        />
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
        <Button
          onClick={async () => {
            const payload =
              includeAnimation() && props.tracks.length > 0
                ? {
                    flame: props.flameDescriptor,
                    animation: { tracks: props.tracks, config: props.config },
                  }
                : props.flameDescriptor
            await navigator.clipboard.writeText(JSON.stringify(payload))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
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
          respond={respond}
        />
      ),
    })
  }

  return { showShareLinkModal }
}
