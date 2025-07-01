import { encodeJsonQueryParam } from '@/utils/jsonQueryParam'
import { Button } from '../Button/Button'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './ShareLink.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const { navigator } = globalThis

type ShareLinkModalProps = {
  url: string
  flameDescriptor: FlameDescriptor
  respond: () => void
}

function ShareLinkModal(props: ShareLinkModalProps) {
  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        Flame URL copied to clipboard!
      </ModalTitleBar>
      <p>{props.url}</p>
      <footer class={ui.footer}>
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(
              JSON.stringify(props.flameDescriptor),
            )
          }}
        >
          Copy JSON
        </Button>
      </footer>
    </>
  )
}

export function createShareLinkModal(flameDescriptor: FlameDescriptor) {
  const requestModal = useRequestModal()

  async function showShareLinkModal() {
    const encoded = await encodeJsonQueryParam(flameDescriptor)
    const url = `${window.location.origin}/?flame=${encoded}`
    await navigator.clipboard.writeText(url)
    await requestModal({
      class: ui.container,
      content: ({ respond }) => (
        <ShareLinkModal
          url={url}
          flameDescriptor={flameDescriptor}
          respond={respond}
        />
      ),
    })
  }

  return { showShareLinkModal }
}
