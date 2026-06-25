import { Book } from '@/icons'
import { VERSION } from '@/version'
import { BenchmarkButton } from '../BenchmarkButton/BenchmarkButton'
import { DebugPanel } from '../Debug/DebugPanel'
import ui from './SoftwareVersion.module.css'

export function SoftwareVersion(props: {
  showHelp: () => void
  showDocs: () => void
  showBenchmark: () => void
}) {
  return (
    <div>
      <DebugPanel />
      <div class={ui.versionContainer}>
        <BenchmarkButton onClick={props.showBenchmark} />
        <button
          class={ui.docsPill}
          onClick={props.showDocs}
          title="Documentation"
        >
          <Book />
          Docs
        </button>
        <button class={ui.aboutPill} onClick={props.showHelp}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          v{VERSION}
        </button>
      </div>
    </div>
  )
}
