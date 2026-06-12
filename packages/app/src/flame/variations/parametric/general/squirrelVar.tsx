import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin, sqrt, tan } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SquirrelVarParams = struct({
  a: f32,
  b: f32,
})

type SquirrelVarParams = Infer<typeof SquirrelVarParams>

const SquirrelVarParamsDefaults: SquirrelVarParams = {
  a: 1.0,
  b: 1.0,
}

const SquirrelVarParamsEditor: EditorFor<SquirrelVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const squirrelVar = parametricVariation(
  'squirrelVar',
  SquirrelVarParams,
  SquirrelVarParamsDefaults,
  SquirrelVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const u = (P.a + EPS.$) * pos.x * pos.x + (P.b + EPS.$) * pos.y * pos.y
    return vec2f(cos(sqrt(u)) * tan(pos.x), sin(sqrt(u)) * tan(pos.y)).mul(
      varInfo.weight,
    )
  },
  'general',
)
