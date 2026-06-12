import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const LazySusanVarParams = struct({
  space: f32,
  twist: f32,
  spin: f32,
  x: f32,
  y: f32,
})

type LazySusanVarParams = Infer<typeof LazySusanVarParams>

const LazySusanVarParamsDefaults: LazySusanVarParams = {
  space: 0.4,
  twist: 0.2,
  spin: 0.1,
  x: 0.1,
  y: 0.2,
}

const LazySusanVarParamsEditor: EditorFor<LazySusanVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'space', 'Space', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'twist', 'Twist', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'spin', 'Spin', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x', 'X', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
  </>
)

export const lazySusanVar = parametricVariation(
  'lazySusanVar',
  LazySusanVarParams,
  LazySusanVarParamsDefaults,
  LazySusanVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const w = varInfo.weight
    const xx = pos.x - P.x
    const yy = pos.y + P.y
    const rr = sqrt(xx * xx + yy * yy)

    if (rr < w) {
      const a = atan2(yy, xx) + P.spin + P.twist * (w - rr)
      const nr = w * rr
      return vec2f(nr * cos(a) + P.x, nr * sin(a) - P.y)
    }

    const nr = w * (1.0 + P.space / rr)
    return vec2f(nr * xx + P.x, nr * yy - P.y)
  },
  'general',
)
