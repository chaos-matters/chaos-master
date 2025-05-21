import { encodeJsonQueryParam } from '@/utils/jsonQueryParam'
import { useRequestModal } from '../Modal/Modal'
import ui from './ShareLink.module.css'
import type { FlameFunction } from '@/flame/flameFunction'

const { navigator } = globalThis

type ShareLinkModalProps = {
  url: string
  flameFunctions: FlameFunction[]
  respond: () => void
}

function ShareLinkModal(props: ShareLinkModalProps) {
  return (
    <div class={ui.container}>
      <h1>Flame URL copied to clipboard!</h1>
      <p>{props.url}</p>
      <footer>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(
              JSON.stringify(props.flameFunctions),
            )
          }}
        >
          Copy JSON
        </button>
        <button
          onClick={() => {
            props.respond()
          }}
        >
          Close
        </button>
      </footer>
    </div>
  )
}

export function createShareLinkModal(flameFunctions: FlameFunction[]) {
  const requestModal = useRequestModal()

  async function showShareLinkModal() {
    const encoded = await encodeJsonQueryParam(flameFunctions)
    const url = `${window.location.origin}/?flame=${encoded}`
    await navigator.clipboard.writeText(url)
    await requestModal({
      content: ({ respond }) => (
        <ShareLinkModal
          url={url}
          flameFunctions={flameFunctions}
          respond={respond}
        />
      ),
    })
  }

  return { showShareLinkModal }
}
