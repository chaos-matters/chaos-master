import { createSignal, Show } from 'solid-js'
import { ConsoleLog } from '@/components/ConsoleLog/ConsoleLog'
import { GIT_SHA, VERSION } from '@/version'
import ui from './ErrorHandling.module.css'

export function WebgpuNotSupported() {
  return (
    <div class={ui.fallback}>
      <div class={ui.crashHeader}>
        <h1 class={ui.title}>CHAOS MASTER</h1>

        <p class={ui.text}>
          Your browser or device currently does not support{' '}
          <strong>WebGPU</strong>.
        </p>

        <a
          href="https://github.com/gpuweb/gpuweb/wiki/Implementation-Status"
          target="_blank"
          rel="noopener noreferrer"
          class={ui.btn}
        >
          Check WebGPU Browser Support
        </a>

        <div class={ui.hint}>
          Try the latest Chrome, Firefox, or Safari (on supported hardware) for
          the full experience.
        </div>
      </div>
      <div class={ui.crashBody}>
        <DeviceMetadata />
        <ConsoleLog collapsible defaultOpen />
        <div class={ui.crashActions}>
          <button class={ui.reloadBtn} onClick={reloadPage}>
            Reload Page
          </button>
          <button class={ui.reloadClearBtn} onClick={reloadAndClearStorage}>
            Reload + Clear Data
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Device metadata for crash bug reports
// ---------------------------------------------------------------------------

interface MetadataEntry {
  label: string
  value: string
}

function gatherDeviceMetadata(): MetadataEntry[] {
  const entries: MetadataEntry[] = []
  const { navigator, screen } = globalThis

  // App
  entries.push({ label: 'App Version', value: `${VERSION}${GIT_SHA ? ` (${GIT_SHA})` : ''}` })

  // Browser / OS
  entries.push({ label: 'User Agent', value: navigator.userAgent })
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  entries.push({ label: 'Platform', value: navigator.platform })
  entries.push({ label: 'Language', value: navigator.language })

  // Screen
  entries.push({
    label: 'Screen',
    value: `${screen.width}x${screen.height} @ ${devicePixelRatio}x`,
  })
  entries.push({
    label: 'Viewport',
    value: `${window.innerWidth}x${window.innerHeight}`,
  })

  // WebGPU
  entries.push({
    label: 'WebGPU',
    value: 'gpu' in navigator ? 'Supported' : 'Not supported',
  })

  // Memory (Chrome-only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mem = (performance as any).memory as
    | { jsHeapSizeLimit: number; usedJSHeapSize: number; totalJSHeapSize: number }
    | undefined
  if (mem) {
    const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)} MB`
    entries.push({
      label: 'JS Heap',
      value: `${mb(mem.usedJSHeapSize)} / ${mb(mem.totalJSHeapSize)} (limit ${mb(mem.jsHeapSizeLimit)})`,
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deviceMemory = (navigator as any).deviceMemory as number | undefined
  if (deviceMemory !== undefined) {
    entries.push({ label: 'Device Memory', value: `~${deviceMemory} GB` })
  }

  // Hardware concurrency
  if (navigator.hardwareConcurrency) {
    entries.push({ label: 'CPU Cores', value: String(navigator.hardwareConcurrency) })
  }

  return entries
}

function formatMetadataText(entries: MetadataEntry[]): string {
  const maxLabel = Math.max(...entries.map((e) => e.label.length))
  return entries
    .map((e) => `${e.label.padEnd(maxLabel)}  ${e.value}`)
    .join('\n')
}

function DeviceMetadata() {
  const entries = gatherDeviceMetadata()
  const [copied, setCopied] = createSignal(false)
  const [open, setOpen] = createSignal(false)

  function copyMetadata(e: MouseEvent) {
    e.stopPropagation()
    const text = formatMetadataText(entries)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div class={ui.metadataSection}>
      <div
        class={ui.metadataHeader}
        onClick={() => setOpen((v) => !v)}
      >
        <span class={ui.metadataTitle}>
          <span
            class={ui.collapseIndicator}
            classList={{ [ui.collapseOpen!]: open() }}
          />
          Device Info
        </span>
        <button class={ui.metadataCopyBtn} onClick={copyMetadata}>
          {copied() ? 'Copied!' : 'Copy Device Info'}
        </button>
      </div>
      <Show when={open()}>
        <div class={ui.metadataGrid}>
          {entries.map((entry) => (
            <>
              <span class={ui.metadataLabel}>{entry.label}</span>
              <span class={ui.metadataValue}>{entry.value}</span>
            </>
          ))}
        </div>
      </Show>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recovery actions for crash screen
// ---------------------------------------------------------------------------

function reloadPage() {
  window.location.reload()
}

function reloadAndClearStorage() {
  // eslint-disable-next-line no-restricted-globals
  const confirmed = confirm(
    'This will clear all local data including recent flames, settings, and preferences.\n\nAre you sure?',
  )
  if (confirmed) {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // Incognito mode may throw
    }
    // Also attempt to clear IndexedDB databases
    if (window.indexedDB?.databases) {
      window.indexedDB.databases().then((dbs) => {
        for (const db of dbs) {
          if (db.name) window.indexedDB.deleteDatabase(db.name)
        }
      })
    }
    window.location.reload()
  }
}

export function AppCrashed() {
  return (
    <div class={ui.fallback}>
      <div class={ui.crashHeader}>
        <h1 class={ui.title}>CHAOS MASTER</h1>
        <p class={ui.text}>
          Chaos Master v{VERSION} <sup>alpha</sup> crashed, see logs for more
          details.
        </p>
        <span>
          Check current issues or open a bug report at{' '}
          <a
            class={ui.githubLink}
            href="https://github.com/chaos-matters/chaos-master/issues"
            target="_blank"
          >
            GitHub.
          </a>
        </span>
      </div>
      <div class={ui.crashBody}>
        <DeviceMetadata />
        <ConsoleLog collapsible defaultOpen />
        <div class={ui.crashActions}>
          <button class={ui.reloadBtn} onClick={reloadPage}>
            Reload Page
          </button>
          <button class={ui.reloadClearBtn} onClick={reloadAndClearStorage}>
            Reload + Clear Data
          </button>
        </div>
      </div>
    </div>
  )
}
