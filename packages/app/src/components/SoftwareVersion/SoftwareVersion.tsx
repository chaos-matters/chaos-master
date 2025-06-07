import { VERSION } from '@/version'
import { DebugPanel } from '../Debug/DebugPanel'
import { createShowHelp } from '../HelpModal/HelpModal'
import { QuestionMark } from '../QuestionMark/QuestionMark'
import ui from './SoftwareVersion.module.css'

export function SoftwareVersion() {
  const showHelp = createShowHelp()
  return (
    <div>
      <DebugPanel />
      <button class={ui.version} onClick={showHelp}>
        Chaos Master v{VERSION} <sup>alpha</sup> <QuestionMark />
      </button>
    </div>
  )
}
