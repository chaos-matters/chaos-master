import { f32, struct, vec2f } from 'typegpu/data'
import { exp, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SigmoidVarParams = struct({
  shiftx: f32,
  shifty: f32,
})

type SigmoidVarParams = Infer<typeof SigmoidVarParams>

const SigmoidVarParamsDefaults: SigmoidVarParams = {
  shiftx: 1.0,
  shifty: 1.0,
}

const SigmoidVarParamsEditor: EditorFor<SigmoidVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'shiftx', 'Shift X', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'shifty', 'Shift Y', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
  </>
)

export const sigmoidVar = parametricVariation(
  'sigmoidVar',
  SigmoidVarParams,
  SigmoidVarParamsDefaults,
  SigmoidVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let ax = f32(1.0)
    let sx = P.shiftx
    if (sx < 1.0 && sx > -1.0) {
      if (sx === 0.0) {
        sx = EPS.$
        ax = 1.0
      } else {
        ax = select(f32(-1.0), f32(1.0), sx > 0.0)
        sx = 1.0 / sx
      }
    }
    let ay = f32(1.0)
    let sy = P.shifty
    if (sy < 1.0 && sy > -1.0) {
      if (sy === 0.0) {
        sy = EPS.$
        ay = 1.0
      } else {
        ay = select(f32(-1.0), f32(1.0), sy > 0.0)
        sy = 1.0 / sy
      }
    }

    sx *= -5.0
    sy *= -5.0

    const c0 = ax / (1.0 + exp(sx * pos.x))
    const c1 = ay / (1.0 + exp(sy * pos.y))
    return vec2f(2.0 * (c0 - 0.5), 2.0 * (c1 - 0.5)).mul(varInfo.weight)
  },
  'general',
)
