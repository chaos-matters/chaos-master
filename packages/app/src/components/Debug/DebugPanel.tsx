import { createSignal, Show } from 'solid-js'
import { IS_DEV } from '@/defaults'
import { accumulatedPointCount, iterationSpeedPointPerSec, qualityPointCountLimit, renderTimings, } from '@/flame/renderStats'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import ui from './DebugPanel.module.css'

const bigNumberFormatter = Intl.NumberFormat('en', { notation: 'compact' })

function formatIterationSpeed(pointPerSec: number | undefined) {
  return pointPerSec !== undefined && Number.isFinite(pointPerSec)
    ? bigNumberFormatter.format(pointPerSec)
    : '?'
}

export function DebugPanel() {
  const [showDebugPanel, setShowDebugPanel] = createSignal(IS_DEV)
  const [expanded, setExpanded] = createSignal(window.innerWidth >= 769)
  const formatValueForPanel = (ms: number) => {
    return `${ms.toFixed(2)} ms`
  }
  useKeyboardShortcuts({
    KeyM: (ev) => {
      if (ev.metaKey || ev.ctrlKey) {
        setShowDebugPanel(!showDebugPanel())
        return true
      }
    },
  })

  return (
    <Show when={showDebugPanel()}>
      <div class={ui.wrapper}>
        {/* Toggle tab -- vertically centered on the left edge */}
        <button
          class={ui.toggleTab}
          onClick={() => setExpanded(!expanded())}
          title={expanded() ? 'Collapse stats' : 'Expand stats'}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            style={{ transform: expanded() ? 'rotate(180deg)' : '' }}
          >
            <path
              fill="currentColor"
              d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
            />
          </svg>
        </button>

        {/* Panel content */}
        <Show when={expanded()}>
          <div class={ui.debugInfo}>
            <p>
              {bigNumberFormatter.format(accumulatedPointCount())} /{' '}
              {bigNumberFormatter.format(qualityPointCountLimit()())} Iters
            </p>
            <p>
              {formatIterationSpeed(iterationSpeedPointPerSec())} Iters / sec
            </p>
            <p>{formatValueForPanel(renderTimings().ifsMs)} IFS</p>
            <p>{formatValueForPanel(renderTimings().adaptiveFilterMs)} Blur</p>
            <p>{formatValueForPanel(renderTimings().colorGradingMs)} Grading</p>
          </div>
        </Show>
      </div>
    </Show>
  )
}
