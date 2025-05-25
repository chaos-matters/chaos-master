import { For } from 'solid-js'
import Cross from '@/icons/cross.svg'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import { VERSION } from '@/version'
import { Button } from '../Button/Button'
import { useRequestModal } from '../Modal/Modal'
import ui from './HelpModal.module.css'

type KeyCombination = {
  key: string
  ctrl?: true
  shift?: true
}

type ShortcutDescriptor = {
  keyCombinations: KeyCombination[]
  description: string
}

const shortcuts: ShortcutDescriptor[] = [
  {
    keyCombinations: [{ key: 'Esc' }],
    description: 'Close sidebar',
  },
  {
    keyCombinations: [{ key: 'Z', ctrl: true }],
    description: 'Undo last change',
  },
  {
    keyCombinations: [
      { key: 'Y', ctrl: true },
      { key: 'Z', ctrl: true, shift: true },
    ],
    description: 'Redo last change',
  },
  {
    keyCombinations: [{ key: 'D' }],
    description: 'Toggle draw mode',
  },
]

function isMac() {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return globalThis.navigator.platform.indexOf('Mac') !== -1
}

const ctrlKey = isMac() ? '⌘ ' : 'Ctrl + '
const shiftKey = isMac() ? '⇧ ' : 'Shift + '

function KeyCombination(props: { keyCombination: KeyCombination }) {
  return (
    <kbd class={ui.keyCombination}>
      {props.keyCombination.ctrl ? ctrlKey : ''}
      {props.keyCombination.shift ? shiftKey : ''}
      {props.keyCombination.key}
    </kbd>
  )
}

type HelpModalProps = {
  respond: () => void
}

function HelpModal(props: HelpModalProps) {
  useKeyboardShortcuts(
    {
      Escape: () => {
        props.respond()
        return true
      },
    },
    // force it to go before sidebar closing event
    // using the capturing phase
    { capture: true },
  )
  return (
    <>
      <div class={ui.title}>
        <h1>
          Chaos Master v{VERSION} <sup>alpha</sup>
        </h1>
        <Button
          onClick={() => {
            props.respond()
          }}
        >
          <Cross width="1rem" height="1rem" />
        </Button>
      </div>
      <p>Keyboard Shortcuts</p>
      <div class={ui.shortcutsGrid}>
        <For each={shortcuts}>
          {({ description, keyCombinations }) => (
            <div class={ui.shortcutRow}>
              <span class={ui.shortcutDescription}>{description}</span>
              <div class={ui.keyCombinations}>
                <For each={keyCombinations}>
                  {(keyCombination) => (
                    <KeyCombination keyCombination={keyCombination} />
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </>
  )
}

export function createShowHelp() {
  const requestModal = useRequestModal()

  async function showHelp() {
    await requestModal({
      content: ({ respond }) => <HelpModal respond={respond} />,
    })
  }

  return showHelp
}
