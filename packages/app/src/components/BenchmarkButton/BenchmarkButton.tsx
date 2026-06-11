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
      title="Run Benchmark"
    >
      <Zap />
    </button>
  )
}
