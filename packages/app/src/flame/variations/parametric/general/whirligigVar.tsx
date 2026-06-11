import { f32, struct, vec2f } from 'typegpu/data'
import { cos, cosh, floor, select, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const WhirligigVarParams = struct({
  mode: f32,
})

type WhirligigVarParams = Infer<typeof WhirligigVarParams>

const WhirligigVarParamsDefaults: WhirligigVarParams = {
  mode: 0.0,
}

const WhirligigVarParamsEditor: EditorFor<WhirligigVarParams> = (props) => (
  <RangeEditor
    {...editorProps(props, 'mode', 'Mode', props.dataParameterPath)}
    min={0}
    max={15}
    step={1}
  />
)

export const whirligigVar = parametricVariation(
  'whirligigVar',
  WhirligigVarParams,
  WhirligigVarParamsDefaults,
  WhirligigVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const csin = sin(pos.x)
    const ccos = cos(pos.x)
    const csinh = sinh(pos.y)
    const ccosh = cosh(pos.y)
    const m = f32(floor(P.mode + 0.5))
    const signBits = m % 4.0

    const xNum = select(csin, ccos, m < 4.0 || m >= 12.0)
    const xDen = select(csinh, ccosh, m < 8.0)
    const yNum = select(ccos, csin, m < 4.0 || m >= 12.0)
    const yDen = select(ccosh, csinh, m < 8.0)
    const sx = select(f32(-1.0), f32(1.0), m % 2.0 < 0.5)
    const sy = select(f32(-1.0), f32(1.0), signBits > 0.5 && signBits < 2.5)

    return vec2f((sx * xNum) / xDen, (sy * yNum) / yDen).mul(varInfo.weight)
  },
  'general',
)
