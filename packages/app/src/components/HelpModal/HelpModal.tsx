import { createResource, createSignal, For, Show, Suspense } from 'solid-js'
import { IS_DEV } from '@/defaults'
import { Changelog, GitHub, Terminal } from '@/icons'
import { getWebgpuComponents } from '@/lib/WebgpuAdapter'
import { formatBytes } from '@/utils/formatBytes'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import { GIT_SHA, VERSION } from '@/version'
import { createShowChangelog } from '../AboutPanel/Changelog'
import { ConsoleLog } from '../ConsoleLog/ConsoleLog'
import { useRequestModal } from '../Modal/ModalContext'
import ui from './HelpModal.module.css'
import type { QuickPickerMode } from '../QuickVariationPicker/QuickVariationPicker'

export type SidebarLayoutMode = 'compact' | 'wide'

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
  {
    keyCombinations: [{ key: 'M', ctrl: true }],
    description: 'Toggle debug panel',
  },
]

const { navigator: nav } = globalThis

function isMac() {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return nav.platform.indexOf('Mac') !== -1
}

const ctrlKey = isMac() ? '\u2318 ' : 'Ctrl + '
const shiftKey = isMac() ? '\u21E7 ' : 'Shift + '

function KeyCombination(props: { keyCombination: KeyCombination }) {
  return (
    <kbd class={ui.keyCombination}>
      {props.keyCombination.ctrl ? ctrlKey : ''}
      {props.keyCombination.shift ? shiftKey : ''}
      {props.keyCombination.key}
    </kbd>
  )
}

async function getGPUDeviceInformation() {
  const { adapter } = await getWebgpuComponents({
    powerPreference: 'high-performance',
  })
  const { info, limits } = adapter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memoryHeaps: { size: number }[] | undefined = (info as any).memoryHeaps
  const heaps = memoryHeaps?.map((m) => m.size)

  return {
    description: info.description,
    vendor: info.vendor,
    architecture: info.architecture,
    maxBufferSize: limits.maxBufferSize,
    heaps,
  }
}

/**
 * Gathers GPU + browser/device metadata as copyable text.
 */
function gatherFullDeviceInfo(
  gpuInfo?: Awaited<ReturnType<typeof getGPUDeviceInformation>>,
): string {
  const lines: string[] = []
  const { navigator: n, screen } = globalThis

  lines.push(`App Version : ${VERSION}${GIT_SHA ? ` (${GIT_SHA})` : ''}`)
  lines.push(`User Agent  : ${n.userAgent}`)
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  lines.push(`Platform    : ${n.platform}`)
  lines.push(`Language    : ${n.language}`)

  lines.push(
    `Screen      : ${screen.width}x${screen.height} @ ${window.devicePixelRatio}x`,
  )
  lines.push(`Viewport    : ${window.innerWidth}x${window.innerHeight}`)
  lines.push(`WebGPU      : ${'gpu' in n ? 'Supported' : 'Not supported'}`)

  if (n.hardwareConcurrency) {
    lines.push(`CPU Cores   : ${n.hardwareConcurrency}`)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deviceMemory = (n as any).deviceMemory as number | undefined
  if (deviceMemory !== undefined) {
    lines.push(`Device RAM  : ~${deviceMemory} GB`)
  }

  if (gpuInfo) {
    lines.push('')
    lines.push('--- GPU ---')
    if (gpuInfo.description) lines.push(`Device      : ${gpuInfo.description}`)
    lines.push(`Vendor      : ${gpuInfo.vendor}`)
    if (gpuInfo.architecture)
      lines.push(`Architecture: ${gpuInfo.architecture}`)
    lines.push(`Max Buffer  : ${formatBytes(gpuInfo.maxBufferSize)}`)
    if (gpuInfo.heaps) {
      lines.push(
        `VRAM        : ${gpuInfo.heaps.map((s) => formatBytes(s)).join(' + ')}`,
      )
    }
  }

  return lines.join('\n')
}

type HelpModalProps = {
  respond: () => void
  quickPickerMode: () => QuickPickerMode
  onQuickPickerModeChange: (mode: QuickPickerMode) => void
  sidebarLayoutMode: () => SidebarLayoutMode
  onSidebarLayoutModeChange: (mode: SidebarLayoutMode) => void
  isCompact: () => boolean
  onToggleCompact: () => void
}

function HelpModal(props: HelpModalProps) {
  const [gpuDeviceInfo] = createResource(getGPUDeviceInformation)
  const showChangelog = createShowChangelog()
  const [showConsole, setShowConsole] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  function copyDeviceInfo() {
    const text = gatherFullDeviceInfo(gpuDeviceInfo())
    // eslint-disable-next-line no-restricted-globals
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  useKeyboardShortcuts({
    Escape: () => {
      props.respond()
      return true
    },
  })

  return (
    <>
      {/* Compact hero: title left, icons + badges center, close top-right */}
      <div class={ui.heroSection}>
        <h1 class={ui.heroTitle}>Chaos Master</h1>
        <div class={ui.heroRight}>
          <div class={ui.iconRow}>
            <a
              class={ui.iconLink}
              href="https://github.com/chaos-matters/chaos-master"
              target="_blank"
              title="GitHub"
            >
              <GitHub />
            </a>
            <button
              class={ui.iconBtn}
              onClick={showChangelog}
              title="View Changelog"
            >
              <Changelog />
            </button>
            <Show when={IS_DEV}>
              <button
                class={ui.iconBtn}
                classList={{ [ui.consoleActive!]: showConsole() }}
                onClick={() => setShowConsole((v) => !v)}
                title="Console Logs"
              >
                <Terminal />
              </button>
            </Show>
          </div>
          <div class={ui.badgeRow}>
            <span class={ui.versionBadge}>v{VERSION}</span>
            {GIT_SHA ? <span class={ui.shaBadge}>{GIT_SHA}</span> : null}
          </div>
        </div>
        <button
          class={ui.closeBtn}
          onClick={() => {
            props.respond()
          }}
          title="Close"
        >
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path
              fill="currentColor"
              d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"
            />
          </svg>
        </button>
      </div>

      <h2 class={ui.sectionTitle}>General Settings</h2>
      <div class={ui.pickerModeRow}>
        <span class={ui.pickerModeLabel}>Default mode</span>
        <div class={ui.pickerModeBtns}>
          <button
            class={ui.pickerModeBtn}
            classList={{
              [ui.pickerModeBtnActive!]: props.quickPickerMode() === 'list',
            }}
            onClick={() => {
              props.onQuickPickerModeChange('list')
            }}
          >
            List
          </button>
          <button
            class={ui.pickerModeBtn}
            classList={{
              [ui.pickerModeBtnActive!]: props.quickPickerMode() === 'gallery',
            }}
            onClick={() => {
              props.onQuickPickerModeChange('gallery')
            }}
          >
            Gallery
          </button>
        </div>
      </div>

      <div class={ui.pickerModeRow}>
        <span class={ui.pickerModeLabel}>Sidebar width</span>
        <div class={ui.pickerModeBtns}>
          <button
            class={ui.pickerModeBtn}
            classList={{
              [ui.pickerModeBtnActive!]:
                props.sidebarLayoutMode() === 'compact',
            }}
            onClick={() => {
              props.onSidebarLayoutModeChange('compact')
            }}
          >
            Compact
          </button>
          <button
            class={ui.pickerModeBtn}
            classList={{
              [ui.pickerModeBtnActive!]: props.sidebarLayoutMode() === 'wide',
            }}
            onClick={() => {
              props.onSidebarLayoutModeChange('wide')
            }}
          >
            Wide
          </button>
        </div>
      </div>

      <div class={ui.pickerModeRow}>
        <span class={ui.pickerModeLabel}>Compact UI</span>
        <div class={ui.pickerModeBtns}>
          <button
            class={ui.pickerModeBtn}
            classList={{ [ui.pickerModeBtnActive!]: !props.isCompact() }}
            onClick={() => {
              if (props.isCompact()) props.onToggleCompact()
            }}
          >
            Off
          </button>
          <button
            class={ui.pickerModeBtn}
            classList={{ [ui.pickerModeBtnActive!]: props.isCompact() }}
            onClick={() => {
              if (!props.isCompact()) props.onToggleCompact()
            }}
          >
            On
          </button>
        </div>
      </div>

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
      <h2 class={ui.sectionTitle}>Guided Tours</h2>
      <div class={ui.tourButtons}>
        <button
          class={ui.tourBtn}
          onClick={() => {
            window.location.hash = '#tour=app'
            props.respond()
          }}
        >
          App Tour
        </button>
        <button
          class={ui.tourBtn}
          onClick={() => {
            window.location.hash = '#tour=sidebar'
            props.respond()
          }}
        >
          Sidebar Tour
        </button>
        <button
          class={ui.tourBtn}
          onClick={() => {
            window.location.hash = '#tour=timeline'
            props.respond()
          }}
        >
          Timeline Tour
        </button>
      </div>

      <div class={ui.gpuHeader}>
        <h2 class={ui.sectionTitle}>GPU / Device Info</h2>
        <button class={ui.copyDeviceBtn} onClick={copyDeviceInfo}>
          {copied() ? 'Copied!' : 'Copy Info'}
        </button>
      </div>
      <div class={ui.gpuSection}>
        <Suspense fallback={<span class={ui.gpuLoading}>Querying GPU...</span>}>
          <Show when={gpuDeviceInfo()} keyed>
            {(deviceInfo) => {
              const rows: {
                label: string
                value: string
                color: 'green' | 'blue'
              }[] = []
              if (deviceInfo.description !== '') {
                rows.push({
                  label: 'Device',
                  value: deviceInfo.description,
                  color: 'green',
                })
              }
              rows.push({
                label: 'Vendor',
                value: deviceInfo.vendor,
                color: 'blue',
              })
              if (deviceInfo.architecture !== '') {
                rows.push({
                  label: 'Architecture',
                  value: deviceInfo.architecture,
                  color: 'blue',
                })
              }
              rows.push({
                label: 'Max Buffer',
                value: formatBytes(deviceInfo.maxBufferSize),
                color: 'green',
              })
              if (deviceInfo.heaps) {
                rows.push({
                  label: 'VRAM',
                  value: deviceInfo.heaps
                    .map((size) => formatBytes(size))
                    .join(' + '),
                  color: 'green',
                })
              }
              return (
                <div class={ui.gpuGrid}>
                  <For each={rows}>
                    {(row) => (
                      <>
                        <span class={ui.gpuLabel}>{row.label}</span>
                        <span class={ui.gpuValue}>
                          <span
                            class={ui.gpuPill}
                            classList={{
                              [ui.gpuPillBlue!]: row.color === 'blue',
                            }}
                          >
                            {row.value}
                          </span>
                        </span>
                      </>
                    )}
                  </For>
                </div>
              )
            }}
          </Show>
        </Suspense>
      </div>
      <Show when={IS_DEV && showConsole()}>
        <h2 class={ui.sectionTitle}>Console Logs</h2>
        <ConsoleLog />
      </Show>
    </>
  )
}

export function createShowHelp(
  quickPickerMode: () => QuickPickerMode,
  onQuickPickerModeChange: (mode: QuickPickerMode) => void,
  sidebarLayoutMode: () => SidebarLayoutMode,
  onSidebarLayoutModeChange: (mode: SidebarLayoutMode) => void,
  isCompact: () => boolean,
  onToggleCompact: () => void,
) {
  const requestModal = useRequestModal()

  async function showHelp() {
    await requestModal({
      class: ui.helpModal,
      content: ({ respond }) => (
        <HelpModal
          respond={respond}
          quickPickerMode={quickPickerMode}
          onQuickPickerModeChange={onQuickPickerModeChange}
          sidebarLayoutMode={sidebarLayoutMode}
          onSidebarLayoutModeChange={onSidebarLayoutModeChange}
          isCompact={isCompact}
          onToggleCompact={onToggleCompact}
        />
      ),
    })
  }

  return showHelp
}
