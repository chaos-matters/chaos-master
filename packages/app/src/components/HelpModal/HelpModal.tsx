import { createResource, For, Show, Suspense } from 'solid-js'
import { GitHub } from '@/icons'
import { formatBytes } from '@/utils/formatBytes'
import { sum } from '@/utils/sum'
import { VERSION } from '@/version'
import { useRequestModal } from '../Modal/Modal'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
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
    keyCombinations: [{ key: 'F' }],
    description: 'Fullscreen (close sidebar)',
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

const { navigator } = globalThis

async function getGPUDeviceInformation() {
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  })
  if (!adapter) {
    throw new Error(`WebGPU is not supported`)
  }
  const { info, limits } = adapter

  // This property exists only when WebGPU Developer Features flag is set
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memoryHeaps: { size: number }[] | undefined = (info as any).memoryHeaps
  const totalHeap = memoryHeaps
    ? sum(memoryHeaps.map((m) => m.size))
    : undefined

  return {
    description: info.description,
    vendor: info.vendor,
    architecture: info.architecture,
    maxBufferSize: limits.maxBufferSize,
    totalHeap,
  }
}

type HelpModalProps = {
  respond: () => void
}

function HelpModal(props: HelpModalProps) {
  const [gpuDeviceInfo] = createResource(getGPUDeviceInformation)
  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        Chaos Master v{VERSION} <sup>alpha</sup>
      </ModalTitleBar>
      <a
        class={ui.githubLink}
        href="https://github.com/chaos-matters/chaos-master"
        target="_blank"
      >
        <GitHub /> View source
      </a>
      <h2 class={ui.sectionTitle}>Keyboard Shortcuts</h2>
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
      <h2 class={ui.sectionTitle}>GPU Information</h2>
      <div class={ui.gpuInformation}>
        <Suspense fallback={<>Loading...</>}>
          <Show when={gpuDeviceInfo()} keyed>
            {(deviceInfo) => (
              <>
                {deviceInfo.description !== '' ? (
                  <p>Name: {deviceInfo.description}</p>
                ) : undefined}
                <p>Vendor: {deviceInfo.vendor}</p>
                <p>Architecture: {deviceInfo.architecture}</p>
                <p>Max Buffer Size: {formatBytes(deviceInfo.maxBufferSize)}</p>
                {deviceInfo.totalHeap !== undefined && (
                  <p>Total VRAM: {formatBytes(deviceInfo.totalHeap)}</p>
                )}
              </>
            )}
          </Show>
        </Suspense>
      </div>
    </>
  )
}

export function createShowHelp() {
  const requestModal = useRequestModal()

  async function showHelp() {
    await requestModal({
      class: ui.helpModal,
      content: ({ respond }) => <HelpModal respond={respond} />,
    })
  }

  return showHelp
}
