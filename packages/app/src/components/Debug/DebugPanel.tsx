import { createSignal, Show } from 'solid-js'
import { isDev } from 'solid-js/web'
import {
  accumulatedPointCount,
  iterationSpeedPointPerSec,
  qualityPointCountLimit,
  renderTimings,
} from '@/flame/renderStats'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import ui from './DebugPanel.module.css'

const bigNumberFormatter = Intl.NumberFormat('en', { notation: 'compact' })

function formatIterationSpeed(pointPerSec: number | undefined) {
  return pointPerSec !== undefined && Number.isFinite(pointPerSec)
    ? bigNumberFormatter.format(pointPerSec)
    : '?'
}

export function DebugPanel() {
  const [showDebugPanel, setShowDebugPanel] = createSignal(isDev)
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
      <div class={ui.debugInfo}>
        <p>
          {bigNumberFormatter.format(accumulatedPointCount())} /{' '}
          {bigNumberFormatter.format(qualityPointCountLimit()())} Iters
        </p>
        <p>{formatIterationSpeed(iterationSpeedPointPerSec())} Iters / sec</p>
        <p>{formatValueForPanel(renderTimings().ifsMs)} IFS</p>
        <p>{formatValueForPanel(renderTimings().adaptiveFilterMs)} Blur</p>
        <p>{formatValueForPanel(renderTimings().colorGradingMs)} Grading</p>
      </div>
    </Show>
  )
}
