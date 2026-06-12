import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, log } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const LogApoVarParams = struct({
  base: f32,
})

type LogApoVarParams = Infer<typeof LogApoVarParams>

const LogApoVarParamsDefaults: LogApoVarParams = {
  base: 2.71828182845905,
}

const LogApoVarParamsEditor: EditorFor<LogApoVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'base', 'Base', props.dataParameterPath)}
      min={0.1}
      max={10}
      step={0.01}
    />
  </>
)

export const logApoVar = parametricVariation(
  'logApoVar',
  LogApoVarParams,
  LogApoVarParamsDefaults,
  LogApoVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const denom = 0.5 / log(P.base)
    const r2 = pos.x * pos.x + pos.y * pos.y
    return vec2f(log(r2) * denom, atan2(pos.y, pos.x)).mul(varInfo.weight)
  },
  'general',
)
