import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, length, log, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Swirl3VarParams = struct({
  shift: f32,
})

type Swirl3VarParams = Infer<typeof Swirl3VarParams>

const Swirl3VarParamsDefaults: Swirl3VarParams = {
  shift: 5,
}

const Swirl3VarParamsEditor: EditorFor<Swirl3VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'shift', 'Shift')}
      min={0}
      max={25}
      step={0.01}
    />
  </>
)

export const swirl3Var = parametricVariation(
  'swirl3Var',
  Swirl3VarParams,
  Swirl3VarParamsDefaults,
  Swirl3VarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const rad = length(pos)
    const ang = atan2(pos.y, pos.x) + log(rad) * P.shift
    const s = sin(ang)
    const c = cos(ang)

    return vec2f(rad * c, rad * s)
  },
)
