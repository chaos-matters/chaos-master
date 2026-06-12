import { f32, struct, vec2f } from 'typegpu/data'
import { cos, exp, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SQRT5 = 2.2360679774997898
const FNATLOG = 0.48121182505960347

const Fibonacci2VarParams = struct({
  sc: f32,
  sc2: f32,
})

type Fibonacci2VarParams = Infer<typeof Fibonacci2VarParams>

const Fibonacci2VarParamsDefaults: Fibonacci2VarParams = {
  sc: 1.0,
  sc2: 1.0,
}

const Fibonacci2VarParamsEditor: EditorFor<Fibonacci2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'sc', 'Scale', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'sc2', 'Scale 2', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const fibonacci2Var = parametricVariation(
  'fibonacci2Var',
  Fibonacci2VarParams,
  Fibonacci2VarParamsDefaults,
  Fibonacci2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const a = pos.y * FNATLOG
    const snum1 = sin(a)
    const cnum1 = cos(a)
    const b = -(pos.x * PI.$ + pos.y * FNATLOG)
    const snum2 = sin(b)
    const cnum2 = cos(b)
    const expArg1 = P.sc2 * pos.x * FNATLOG
    const expArg2 = -P.sc2 * (pos.x * FNATLOG - pos.y * PI.$)
    const eradius1 = P.sc * exp(expArg1)
    const eradius2 = P.sc * exp(expArg2)
    return vec2f(
      (eradius1 * cnum1 - eradius2 * cnum2) / SQRT5,
      (eradius1 * snum1 - eradius2 * snum2) / SQRT5,
    ).mul(varInfo.weight)
  },
  'general',
)
