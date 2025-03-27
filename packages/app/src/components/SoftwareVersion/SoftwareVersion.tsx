import { version } from '../../../package.json'
import ui from './SoftwareVersion.module.css'

export function SoftwareVersion() {
  return (
    <div class={ui.version}>
      Chaos Master v{version} <sup>alpha</sup>
    </div>
  )
}
