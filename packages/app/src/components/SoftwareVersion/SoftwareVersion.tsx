import { createSignal, Show } from 'solid-js'
import { isDev } from 'solid-js/web'
import {
  accumulatedPointCount,
  qualityPointCountLimit,
  renderStats,
} from '@/flame/renderStats'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import { VERSION } from '@/version'
import { createShowHelp } from '../HelpModal/HelpModal'
import { QuestionMark } from '../QuestionMark/QuestionMark'
import ui from './SoftwareVersion.module.css'

const bigNumberFormatter = Intl.NumberFormat('en', { notation: 'compact' })

export function SoftwareVersion() {
  const showHelp = createShowHelp()
  const [showDebugPanel, setShowDebugPanel] = createSignal(isDev)

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
            {bigNumberFormatter.format(accumulatedPointCount())} /{' '}
            {bigNumberFormatter.format(qualityPointCountLimit()?.() ?? 0)} Iters
          </p>
          <p>{(renderStats().timing.ifsNs / 1e6).toFixed(2)} ms IFS</p>
          <p>
            {(renderStats().timing.renderPointsNs / 1e6).toFixed(2)} ms Render
          </p>
          <p>{(renderStats().timing.blurNs / 1e6).toFixed(2)} ms Blur</p>
          <p>
            {(renderStats().timing.colorGradingNs / 1e6).toFixed(2)} ms Grading
          </p>
        </div>
      </Show>
      <button class={ui.version} onClick={showHelp}>
        Chaos Master v{VERSION} <sup>alpha</sup> <QuestionMark />
      </button>
    </div>
  )
}
