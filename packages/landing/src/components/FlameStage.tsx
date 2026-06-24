import { Root } from '@/lib/Root'
import FlameView from './FlameView'
import GpuHealthWatch from './GpuHealthWatch'
import type { FlameViewProps } from './FlameView'

/**
 * Single live-GPU flame stage — a WebGPU Root wrapping the shared FlameView, plus
 * a GpuHealthWatch that flips the page to posters on the first GPU failure. Used
 * by the hero and (via PosterFlame) by the gallery + community cards. One WebGPU
 * device is shared across every Root on the page (getWebgpuComponents caches it).
 */
export type FlameStageProps = FlameViewProps

export default function FlameStage(props: FlameStageProps) {
  return (
    <Root adapterOptions={{ powerPreference: 'high-performance' }}>
      <GpuHealthWatch />
      <FlameView {...props} />
    </Root>
  )
}
