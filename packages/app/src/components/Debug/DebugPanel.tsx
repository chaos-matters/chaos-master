import { createSignal, Show } from 'solid-js'
import { isDev } from 'solid-js/web'
import { renderStats } from '@/flame/renderStats'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import ui from './DebugPanel.module.css'

const bigNumberFormatter = Intl.NumberFormat('en', { notation: 'compact' })

function convertNanoToMilliSeconds(valueNs: number): number {
  return valueNs / 1e6
}
export function DebugPanel() {
  const [showDebugPanel, setShowDebugPanel] = createSignal(isDev)
  const formatValueForPanel = (value: number) => {
    return `${convertNanoToMilliSeconds(value).toFixed(2)} ms`
  }
  useKeyboardShortcuts({
    KeyM: (ev) => {
      if (ev.metaKey || ev.ctrlKey) {
        return setShowDebugPanel(!showDebugPanel())
      }
    },
  })
  return (
    <div>
      <Show when={showDebugPanel()}>
        <div class={ui.appInfo}>
          <p>
            {bigNumberFormatter.format(renderStats().accumulatedPointCount)} /{' '}
            {bigNumberFormatter.format(renderStats().qualityPointCountLimit)}{' '}
            Iters
          </p>
          <p>{formatValueForPanel(renderStats().timing.ifsNs)} IFS</p>
          <p>
            {formatValueForPanel(renderStats().timing.renderPointsNs)} Render
          </p>
          <p>{formatValueForPanel(renderStats().timing.blurNs)} Blur</p>
          <p>
            {formatValueForPanel(renderStats().timing.colorGradingNs)} Grading
          </p>
        </div>
      </Show>
    </div>
  )
}
