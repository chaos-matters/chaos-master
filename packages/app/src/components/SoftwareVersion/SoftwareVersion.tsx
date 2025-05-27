import { VERSION } from '@/version'
import { createShowHelp } from '../HelpModal/HelpModal'
import { QuestionMark } from '../QuestionMark/QuestionMark'
import ui from './SoftwareVersion.module.css'

export function SoftwareVersion() {
  const showHelp = createShowHelp()
  return (
    <button class={ui.version} onClick={showHelp}>
      Chaos Master v{VERSION} <sup>alpha</sup> <QuestionMark />
    </button>
  )
}
