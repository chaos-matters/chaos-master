import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, cosh, floor, log, select, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BTransformVarParams = struct({
  rotate: f32,
  power: f32,
  offset: f32,
  split: f32,
})

type BTransformVarParams = Infer<typeof BTransformVarParams>

const BTransformVarParamsDefaults: BTransformVarParams = {
  rotate: 0.0,
  power: 1.0,
  offset: 0.0,
  split: 0.0,
}

const BTransformVarParamsEditor: EditorFor<BTransformVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'rotate', 'Rotate', props.dataParameterPath)}
      min={-6.2831853}
      max={6.2831853}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'power', 'Power', props.dataParameterPath)}
      min={1.0}
      max={100.0}
      step={1.0}
    />
    <RangeEditor
      {...editorProps(props, 'offset', 'Offset', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'split', 'Split', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const bTransformVar = parametricVariation(
  'bTransformVar',
  BTransformVarParams,
  BTransformVarParamsDefaults,
  BTransformVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let tau =
      (0.5 *
        (log((pos.x + 1.0) * (pos.x + 1.0) + pos.y * pos.y) -
          log((pos.x - 1.0) * (pos.x - 1.0) + pos.y * pos.y))) /
        P.power +
      P.offset
    let sigma =
      PI.$ - atan2(pos.y, pos.x + 1.0) - atan2(pos.y, 1.0 - pos.x) + P.rotate
    sigma =
      sigma / P.power +
      ((2.0 * PI.$) / P.power) * f32(floor(random() * P.power))

    tau = select(tau - P.split, tau + P.split, pos.x >= 0.0)

    const sinht = sinh(tau)
    const cosht = cosh(tau)
    const sinsVal = sin(sigma)
    const coss = cos(sigma)
    const temp = cosht - coss

    return vec2f(sinht / temp, sinsVal / temp).mul(varInfo.weight)
  },
  'general',
)
