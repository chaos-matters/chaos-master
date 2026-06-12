import { createSignal, Show } from 'solid-js'
import { Discord } from '@/icons'
import { persistentSignal } from '@/utils/persistentSignal'
import { Button } from '../Button/Button'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './DiscordShare.module.css'

const CANCEL = Symbol('cancel')

export type DiscordShareMeta = {
  author: string
  title: string
}

type DiscordShareModalProps = {
  previewUrl: string
  respond: (value: DiscordShareMeta | symbol) => void
}

function DiscordShareModal(props: DiscordShareModalProps) {
  const [storedAuthor, setStoredAuthor] = persistentSignal('discord/author', '')
  const [author, setAuthor] = createSignal(storedAuthor())
  const [title, setTitle] = createSignal('')
  const [attempted, setAttempted] = createSignal(false)

  const authorTrimmed = () => author().trim()
  const titleTrimmed = () => title().trim()
  const showError = () => attempted() && authorTrimmed() === ''

  function submit() {
    setAttempted(true)
    if (authorTrimmed() === '') return
    setStoredAuthor(authorTrimmed())
    props.respond({
      author: authorTrimmed(),
      title: titleTrimmed(),
    })
  }

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Share to Discord
      </ModalTitleBar>
      <div class={ui.content}>
        {/* Preview: image + caption below */}
        <div class={ui.preview}>
          <img
            class={ui.previewImage}
            src={props.previewUrl}
            alt="Flame preview"
          />
        </div>

        {/* Author field */}
        <div class={ui.field}>
          <label class={ui.fieldLabel}>
            Author <span class={ui.required}>*</span>
          </label>
          <input
            class={ui.input}
            classList={{ [ui.inputError as string]: showError() }}
            type="text"
            placeholder="Your name"
            value={author()}
            autofocus
            onInput={(e) => {
              setAuthor(e.currentTarget.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
          <Show when={showError()}>
            <span class={ui.errorHint}>A name is required to share.</span>
          </Show>
        </div>

        {/* Title field */}
        <div class={ui.field}>
          <label class={ui.fieldLabel}>
            Title <span class={ui.optional}>(optional)</span>
          </label>
          <input
            class={ui.input}
            type="text"
            placeholder="Name your flame"
            value={title()}
            onInput={(e) => {
              setTitle(e.currentTarget.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </div>
      </div>
      <footer class={ui.footer}>
        <Button
          onClick={() => {
            props.respond(CANCEL)
          }}
        >
          Cancel
        </Button>
        <button class={ui.shareButton} onClick={submit}>
          <Discord />
          Share
        </button>
      </footer>
    </>
  )
}

export function createDiscordShareModal() {
  const requestModal = useRequestModal()

  async function showDiscordShareModal(
    previewUrl: string,
  ): Promise<DiscordShareMeta | undefined> {
    const result = await requestModal<DiscordShareMeta | symbol>({
      class: ui.container,
      content: ({ respond }) => (
        <DiscordShareModal previewUrl={previewUrl} respond={respond} />
      ),
    })
    // Guard against every dismiss path: symbol, undefined (native dialog cancel),
    // or a malformed result that somehow slips through.
    if (
      !result ||
      typeof result === 'symbol' ||
      typeof result.author !== 'string' ||
      result.author.trim() === ''
    ) {
      return undefined
    }
    return result
  }

  return { showDiscordShareModal }
}
