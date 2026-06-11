import { f32, struct, vec2f } from 'typegpu/data'
import { abs, sign, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type HopalongVarParams = Infer<typeof HopalongVarParams>
const HopalongVarParams = struct({
  a: f32,
  b: f32,
  c: f32,
})

const HopalongVarParamsDefaults: HopalongVarParams = {
  a: 0.4,
  b: 1.0,
  c: 0.0,
}

const HopalongVarParamsEditor: EditorFor<HopalongVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const hopalongVar = parametricVariation(
  'hopalongVar',
  HopalongVarParams,
  HopalongVarParamsDefaults,
  HopalongVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const nx = pos.y - sign(pos.x) * sqrt(abs(P.b * pos.x - P.c))
    const ny = P.a - pos.x
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
