import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const FourthVarParams = struct({
  spin: f32,
  space: f32,
  twist: f32,
  x: f32,
  y: f32,
})

type FourthVarParams = Infer<typeof FourthVarParams>

const FourthVarParamsDefaults: FourthVarParams = {
  spin: Math.PI,
  space: 0.1,
  twist: 0.2,
  x: 0.3,
  y: 0.12,
}

const FourthVarParamsEditor: EditorFor<FourthVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'spin', 'Spin', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space', 'Space', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'twist', 'Twist', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x', 'X', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const fourthVar = parametricVariation(
  'fourthVar',
  FourthVarParams,
  FourthVarParamsDefaults,
  FourthVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const w = varInfo.weight
    // kuadran IV: spherical
    if (pos.x > 0.0 && pos.y > 0.0) {
      const a = atan2(pos.y, pos.x)
      const r = 1.0 / sqrt(pos.x * pos.x + pos.y * pos.y)
      return vec2f(r * cos(a), r * sin(a))
    }
    // kuadran I: loonie
    if (pos.x > 0.0 && pos.y < 0.0) {
      const r2 = pos.x * pos.x + pos.y * pos.y
      if (r2 < w * w) {
        const factor = sqrt((w * w) / r2 - 1.0)
        return vec2f(factor * pos.x, factor * pos.y)
      }
      return vec2f(pos.x, pos.y)
    }
    // kuadran III: susan
    if (pos.x < 0.0 && pos.y > 0.0) {
      const xs = pos.x - P.x
      const ys = pos.y + P.y
      const r = sqrt(xs * xs + ys * ys)
      if (r < w) {
        const a = atan2(ys, xs) + P.spin + P.twist * (w - r)
        return vec2f(r * cos(a) + P.x / w, r * sin(a) - P.y / w)
      }
      const sr = 1.0 + P.space / r
      return vec2f(sr * xs + P.x / w, sr * ys - P.y / w)
    }
    // kuadran II: Linear
    return vec2f(pos.x, pos.y)
  },
  'general',
)
