import { Zap } from '@/icons'
import ui from './BenchmarkButton.module.css'

export function BenchmarkButton(props: { onClick: () => void }) {
  return (
    <button
      class={ui.benchmarkBtn}
      onClick={props.onClick}
      onContextMenu={(e) => {
        e.preventDefault()
      }}
      aria-label="Run quick benchmark"
      title="Run quick benchmark"
    >
      <Zap />
    </button>
  )
}
