import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { WithKeyframeTarget } from './withKeyframeTarget'
import type { TransformFunction } from '@/flame/schema/flameSchema'

type WrappedAffineRowProps = {
  tid: string
  transform: TransformFunction
  onRemove: () => void
  onSwap: (dir: number) => void
}

const AFFINE_PARAMS = [
  { path: 'a', label: 'A' },
  { path: 'b', label: 'B' },
  { path: 'c', label: 'C' },
  { path: 'd', label: 'D' },
  { path: 'e', label: 'E' },
  { path: 'f', label: 'F' },
]

export function WrappedAffineRow(props: WrappedAffineRowProps) {
  useKeyframeTarget() // Ensures KeyframeTargetContext is available

  const preParams = AFFINE_PARAMS.map((p) => ({
    ...p,
    path: `transform.${props.tid}.preAffine.${p.path}`,
  }))

  const postParams = AFFINE_PARAMS.map((p) => ({
    ...p,
    path: `transform.${props.tid}.postAffine.${p.path}`,
  }))

  return (
    <div class="affineRow">
      <div class="affineGroup">
        <span class="affineLabel">Pre-Affine:</span>
        <div class="affineParams">
          {preParams.map((p) => (
            <WithKeyframeTarget parameterPath={p.path}>
              <span class="affineValue">
                {p.label}:{' '}
                {props.transform.preAffine[
                  p.path as keyof typeof props.transform.preAffine
                ].toFixed(3)}
              </span>
            </WithKeyframeTarget>
          ))}
        </div>
      </div>

      <div class="affineGroup">
        <span class="affineLabel">Post-Affine:</span>
        <div class="affineParams">
          {postParams.map((p) => (
            <WithKeyframeTarget parameterPath={p.path}>
              <span class="affineValue">
                {p.label}:{' '}
                {props.transform.postAffine[
                  p.path as keyof typeof props.transform.postAffine
                ].toFixed(3)}
              </span>
            </WithKeyframeTarget>
          ))}
        </div>
      </div>

      <div class="affineActions">
        <button
          class="affineButton"
          onClick={(e) => {
            e.stopPropagation()
            props.onSwap(-1)
          }}
        >
          ←
        </button>
        <button
          class="affineButton"
          onClick={(e) => {
            e.stopPropagation()
            props.onSwap(1)
          }}
        >
          →
        </button>
        <button
          class="affineButton"
          onClick={(e) => {
            e.stopPropagation()
            props.onRemove()
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
