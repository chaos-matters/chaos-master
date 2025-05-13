import { encodeJsonQueryParam } from '@/utils/jsonQueryParam'
import { useRequestModal } from '../Modal/Modal'
import type { FlameFunction } from '@/flame/flameFunction'

const { navigator } = globalThis

type ShareLinkModalProps = {
  url: string
  flameFunctions: FlameFunction[]
  respond: () => void
}

function ShareLinkModal(props: ShareLinkModalProps) {
  return (
    <div class="flex w-100 flex-col gap-2 break-all">
      <h1 class="text-neutral-100">Flame URL copied to clipboard!</h1>
      <p class="text-neutral-600">{props.url}</p>
      <footer class="flex justify-end gap-2">
        <button
          class="rounded-md bg-neutral-800 px-2 py-1 text-neutral-300 hover:text-neutral-50"
          onClick={async () => {
            await navigator.clipboard.writeText(
              JSON.stringify(props.flameFunctions),
            )
          }}
        >
          Copy JSON
        </button>
        <button
          class="rounded-md bg-neutral-800 px-2 py-1 text-neutral-300 hover:text-neutral-50"
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
