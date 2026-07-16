import { createResource, createSignal, For, Show, Suspense } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { Changelog, Discord, GitHub, Globe, Heart, Terminal, TriangleAlert, } from '@/icons'
import { getWebgpuComponents } from '@/lib/WebgpuAdapter'
import { getWebglRenderer } from '@/utils/deviceInfo'
import { formatBytes } from '@/utils/formatBytes'
import { detectHardwareTier, hardwareTiers } from '@/utils/hardwareTier'
import { GIT_SHA, VERSION } from '@/version'
import { createShowChangelog } from '../AboutPanel/Changelog'
import { ConsoleLog } from '../ConsoleLog/ConsoleLog'
import { DataManagement } from '../DataManagement/DataManagement'
import { useRequestModal } from '../Modal/ModalContext'
import ui from './HelpModal.module.css'
import type { QuickPickerMode } from '../QuickVariationPicker/QuickVariationPicker'
import type { Theme } from '@/contexts/ThemeContext'
import type { HardwareTier } from '@/utils/hardwareTier'

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
    keyCombinations: [{ key: 'D', ctrl: true }],
    description: 'Toggle UI theme (dark / light)',
  },
  {
    keyCombinations: [{ key: 'M', ctrl: true }],
    description: 'Toggle debug panel',
  },
]

const cameraControls: ShortcutDescriptor[] = [
  {
    keyCombinations: [{ key: 'Left-drag' }],
    description: 'Orbit the 3D camera',
  },
  {
    keyCombinations: [{ key: 'Right-drag' }, { key: 'Middle-drag' }],
    description: 'Pan the 3D camera',
  },
  {
    keyCombinations: [{ key: 'W A S D' }, { key: 'Arrows' }],
    description: 'Pan the 3D camera',
  },
  {
    keyCombinations: [{ key: 'Scroll' }],
    description: 'Zoom in / out',
  },
  {
    keyCombinations: [{ key: 'W A S D' }, { key: 'Q / E' }],
    description:
      'Fly mode: move / up · down (click canvas to look, Esc to exit)',
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
  const heaps = info.memoryHeaps?.map((m) => m.size)

  return {
    description: info.description,
    vendor: info.vendor,
    architecture: info.architecture,
    // Firefox returns empty adapter.info fields — fall back to the WebGL
    // renderer string so the GPU still shows up.
    renderer: getWebglRenderer(),
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
  const deviceMemory = n.deviceMemory
  lines.push(
    `Device RAM  : ${
      deviceMemory !== undefined
        ? `~${deviceMemory} GB`
        : 'Not exposed by browser'
    }`,
  )

  if (gpuInfo) {
    lines.push('')
    lines.push('--- GPU ---')
    // adapter.info.description is empty on Firefox; the WebGL renderer is the
    // fallback so a GPU name still appears.
    const deviceName = gpuInfo.description || gpuInfo.renderer
    lines.push(`Device      : ${deviceName ?? 'Not exposed by browser'}`)
    if (gpuInfo.vendor) lines.push(`Vendor      : ${gpuInfo.vendor}`)
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
  onSetCompact: (value: boolean) => void
  theme: () => Theme
  onThemeChange: (theme: Theme) => void
  onInjectCrash?: () => void
  hardwareTier: () => HardwareTier | null
  onHardwareTierChange?: (tier: HardwareTier) => void
}

function HelpModal(props: HelpModalProps) {
  const [gpuDeviceInfo] = createResource(getGPUDeviceInformation)
  const showChangelog = createShowChangelog()
  const [showConsole, setShowConsole] = createSignal(true)
  const [copied, setCopied] = createSignal(false)
  const { showToast } = useToast()
  const [detectingTier, setDetectingTier] = createSignal(false)

  async function detectTierAgain() {
    if (!props.onHardwareTierChange) return
    setDetectingTier(true)
    try {
      const tier = await detectHardwareTier()
      props.onHardwareTierChange(tier)
      showToast(`Hardware detected as: ${tier}`)
    } catch (err) {
      console.error(err)
      showToast('Failed to detect hardware tier')
    } finally {
      setDetectingTier(false)
    }
  }

  function copyDeviceInfo() {
    const text = gatherFullDeviceInfo(gpuDeviceInfo())
    // eslint-disable-next-line no-restricted-globals
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <>
      {/* Compact hero: title left, icons + badges center, close top-right */}
      <div class={ui.heroSection}>
        <h1 class={ui.heroTitle}>Lumen Apeiron</h1>
        <div class={ui.heroRight}>
          <div class={ui.iconRow}>
            <a
              class={ui.iconLink}
              href="https://about.lumenapeiron.com"
              target="_blank"
              aria-label="Visit our home page"
              title="Visit our home page"
            >
              <Globe />
            </a>
            <a
              class={ui.iconLink}
              href="https://ko-fi.com/chaosmatters"
              target="_blank"
              aria-label="Support on Ko-fi"
              title="Support on Ko-fi"
            >
              <Heart />
            </a>
            <a
              class={ui.iconLink}
              href="https://github.com/sponsors/chaos-matters"
              target="_blank"
              aria-label="Sponsor on GitHub"
              title="Sponsor on GitHub"
            >
              <GitHub />
            </a>
            <a
              class={ui.iconLink}
              href="/discord"
              target="_blank"
              aria-label="Join Discord"
              title="Join Discord"
            >
              <Discord />
            </a>
            <button
              class={ui.iconBtn}
              onClick={showChangelog}
              aria-label="View Changelog"
              title="View Changelog"
            >
              <Changelog />
            </button>
            <button
              class={ui.iconBtn}
              classList={{ [ui.consoleActive!]: showConsole() }}
              onClick={() => setShowConsole((v) => !v)}
              aria-label="Console Logs"
              title="Console Logs"
            >
              <Terminal />
            </button>
            <Show when={props.onInjectCrash}>
              <button
                class={ui.iconBtn}
                onClick={() => {
                  props.respond()
                  props.onInjectCrash?.()
                }}
                aria-label="Inject Crash (dev only)"
                title="Inject Crash (dev only)"
              >
                <TriangleAlert />
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
              props.onSetCompact(false)
            }}
          >
            Off
          </button>
          <button
            class={ui.pickerModeBtn}
            classList={{ [ui.pickerModeBtnActive!]: props.isCompact() }}
            onClick={() => {
              props.onSetCompact(true)
            }}
          >
            On
          </button>
        </div>
      </div>

      <div class={ui.pickerModeRow}>
        <span class={ui.pickerModeLabel}>UI Theme</span>
        <div class={ui.pickerModeBtns}>
          <button
            class={ui.pickerModeBtn}
            classList={{ [ui.pickerModeBtnActive!]: props.theme() === 'dark' }}
            onClick={() => {
              props.onThemeChange('dark')
            }}
          >
            Dark
          </button>
          <button
            class={ui.pickerModeBtn}
            classList={{ [ui.pickerModeBtnActive!]: props.theme() === 'light' }}
            onClick={() => {
              props.onThemeChange('light')
            }}
          >
            Light
          </button>
        </div>
      </div>

      <div class={ui.pickerModeRow}>
        <span class={ui.pickerModeLabel}>Hardware Tier</span>
        <div class={ui.pickerModeBtns}>
          <For each={hardwareTiers}>
            {(tier) => (
              <button
                class={ui.pickerModeBtn}
                classList={{
                  [ui.pickerModeBtnActive!]: props.hardwareTier() === tier,
                }}
                onClick={() => props.onHardwareTierChange?.(tier)}
                style={{ 'text-transform': 'capitalize' }}
              >
                {tier}
              </button>
            )}
          </For>
          <button
            class={ui.pickerModeBtn}
            onClick={detectTierAgain}
            disabled={detectingTier()}
          >
            {detectingTier() ? 'Detecting...' : 'Detect Again'}
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

      <h2 class={ui.sectionTitle}>3D Camera</h2>
      <div class={ui.shortcutsGrid}>
        <For each={cameraControls}>
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
            window.location.hash = '#tour=example1-creation'
            props.respond()
          }}
        >
          Example 1 Creation
        </button>
        <button
          class={ui.tourBtn}
          onClick={() => {
            window.location.hash = '#tour=example2-creation'
            props.respond()
          }}
        >
          Example 2 Creation
        </button>
        <button
          class={ui.tourBtn}
          onClick={() => {
            window.location.hash = '#tour=flame-creation'
            props.respond()
          }}
        >
          Flame Creation
        </button>
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
              // Firefox leaves adapter.info empty; fall back to the WebGL
              // renderer so a GPU name still shows.
              const deviceName = deviceInfo.description || deviceInfo.renderer
              rows.push({
                label: 'Device',
                value: deviceName ?? 'Not exposed by browser',
                color: 'green',
              })
              if (deviceInfo.vendor !== '') {
                rows.push({
                  label: 'Vendor',
                  value: deviceInfo.vendor,
                  color: 'blue',
                })
              }
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

      <h2 class={ui.sectionTitle}>Storage &amp; Data</h2>
      <DataManagement />

      <Show when={showConsole()}>
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
  setCompact: (value: boolean) => void,
  theme: () => Theme,
  onThemeChange: (theme: Theme) => void,
  onInjectCrash?: () => void,
  hardwareTier?: () => HardwareTier | null,
  onHardwareTierChange?: (tier: HardwareTier) => void,
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
          onSetCompact={setCompact}
          theme={theme}
          onThemeChange={onThemeChange}
          onInjectCrash={onInjectCrash}
          hardwareTier={hardwareTier ?? (() => null)}
          onHardwareTierChange={onHardwareTierChange}
        />
      ),
    })
  }

  return showHelp
}
