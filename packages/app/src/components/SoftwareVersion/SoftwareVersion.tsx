import { persistentSignal } from '@/utils/persistentSignal'
import { VERSION } from '@/version'
import { DebugPanel } from '../Debug/DebugPanel'
import { createShowHelp } from '../HelpModal/HelpModal'
import { QuestionMark } from '../QuestionMark/QuestionMark'
import ui from './SoftwareVersion.module.css'
import type { QuickPickerMode } from '../QuickVariationPicker/QuickVariationPicker'

export function SoftwareVersion() {
  const [quickPickerMode, setQuickPickerMode] =
    persistentSignal<QuickPickerMode>('quick-picker-mode', 'list')
  const showHelp = createShowHelp(quickPickerMode, setQuickPickerMode)
  return (
    <div>
      <DebugPanel />
      <button class={ui.version} onClick={showHelp}>
        Chaos Master v{VERSION} <sup>alpha</sup> <QuestionMark />
      </button>
    </div>
  )
}
