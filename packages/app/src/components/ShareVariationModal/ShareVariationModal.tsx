import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { DEFAULT_VARIATION_PREVIEW_POINT_COUNT, DEFAULT_VARIATION_PREVIEW_QUALITY, } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { makeCustomVariationPreviewFlame } from '@/flame/variations/custom'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { encodeVariationShareUrl } from '@/utils/shareLink'
import { Button } from '../Button/Button'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './ShareVariation.module.css'
import type { CustomVariationDef } from '@/flame/variations/custom'

const { navigator } = globalThis

// ── Share (copy link) ────────────────────────────────────────────────────────

function ShareVariationLinkModal(props: {
  def: CustomVariationDef
  respond: () => void
}) {
  const [url, setUrl] = createSignal('')
  const [copied, setCopied] = createSignal(false)
  let resetTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    clearTimeout(resetTimer)
  })

  createEffect(() => {
    void encodeVariationShareUrl(props.def).then(setUrl)
  })

  async function copy() {
    if (!url()) return
    await navigator.clipboard.writeText(url())
    setCopied(true)
    clearTimeout(resetTimer)
    resetTimer = setTimeout(() => setCopied(false), 2000)
  }

  // Copy once the link is ready so the user can paste immediately.
  createEffect(() => {
    if (url()) void copy()
  })

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        Share custom variation
      </ModalTitleBar>
      <div class={ui.content}>
        <p class={ui.note}>
          Anyone who opens this link gets <strong>{props.def.name}</strong>. The
          code is re-checked and previewed on their device before they save it —
          it can't run anything but sandboxed math on the GPU.
        </p>
        <textarea
          class={ui.textarea}
          value={url()}
          readOnly
          title="Click to copy"
          rows={url().length > 100 ? 4 : 2}
          onClick={(e) => {
            e.currentTarget.select()
            void copy()
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
        <Button onClick={() => void copy()}>Copy link</Button>
      </footer>
    </>
  )
}

export function createShareVariationLinkModal() {
  const requestModal = useRequestModal()

  async function showShareVariationLinkModal(def: CustomVariationDef) {
    await requestModal({
      class: ui.container,
      content: ({ respond }) => (
        <ShareVariationLinkModal def={def} respond={respond} />
      ),
    })
  }
  return { showShareVariationLinkModal }
}

// ── Load (preview + save) ─────────────────────────────────────────────────────

function ShareVariationLoadModal(props: {
  def: CustomVariationDef
  alreadyOwned: boolean
  respond: (save: boolean) => void
}) {
  // The variation is already registered (transiently) by importSharedVariations,
  // so its id resolves in the registry and the preview renders.
  const previewFlame = () => makeCustomVariationPreviewFlame(props.def.id)

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(false)
        }}
      >
        Shared custom variation
      </ModalTitleBar>
      <div class={ui.content}>
        <p class={ui.note}>
          Someone shared the custom variation <strong>{props.def.name}</strong>{' '}
          with you. It runs as sandboxed math on your GPU — no scripts. Here's
          how it looks:
        </p>
        <div class={ui.previewCanvas}>
          <AutoCanvas pixelRatio={1}>
            <WheelZoomCamera2D
              zoom={[() => 1, () => {}]}
              position={[() => vec2f(), () => undefined]}
            >
              <Flam3
                animationEnabled={false}
                quality={DEFAULT_VARIATION_PREVIEW_QUALITY}
                pointCountPerBatch={DEFAULT_VARIATION_PREVIEW_POINT_COUNT}
                adaptiveFilterEnabled={false}
                flameDescriptor={previewFlame()}
                renderInterval={1}
                edgeFadeColor={vec4f(0)}
              />
            </WheelZoomCamera2D>
          </AutoCanvas>
        </div>
        <Show when={props.alreadyOwned}>
          <p class={ui.note}>This variation is already in your library.</p>
        </Show>
      </div>
      <footer class={ui.footer}>
        {/* With nothing to save (already owned), the dismiss button is the only
            action — label it "Close" rather than "Not now". */}
        <Button
          onClick={() => {
            props.respond(false)
          }}
        >
          {props.alreadyOwned ? 'Close' : 'Not now'}
        </Button>
        <Show when={!props.alreadyOwned}>
          <Button
            onClick={() => {
              props.respond(true)
            }}
          >
            Save to library
          </Button>
        </Show>
      </footer>
    </>
  )
}

export function createShareVariationLoadModal() {
  const requestModal = useRequestModal()

  /** Resolves true if the user chose to save the shared variation. */
  async function showShareVariationLoadModal(
    def: CustomVariationDef,
    alreadyOwned: boolean,
  ): Promise<boolean> {
    return requestModal<boolean>({
      class: ui.container,
      // Root provides the WebGPU device the preview's Flam3 needs.
      content: ({ respond }) => (
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <ShareVariationLoadModal
            def={def}
            alreadyOwned={alreadyOwned}
            respond={respond}
          />
        </Root>
      ),
    })
  }
  return { showShareVariationLoadModal }
}
