import { VERSION } from '@/version'
import { DebugPanel } from '../Debug/DebugPanel'
import { QuestionMark } from '../QuestionMark/QuestionMark'
import ui from './SoftwareVersion.module.css'

export function SoftwareVersion(props: { showHelp: () => void }) {
  return (
    <div>
      <DebugPanel />
      <button class={ui.version} onClick={props.showHelp}>
        CM v{VERSION} <QuestionMark />
      </button>
    </div>
  )
}
