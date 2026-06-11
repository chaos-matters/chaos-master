import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CirclizeVarParams = struct({
  hole: f32,
})

type CirclizeVarParams = Infer<typeof CirclizeVarParams>

const CirclizeVarParamsDefaults: CirclizeVarParams = {
  hole: 0.4,
}

const CirclizeVarParamsEditor: EditorFor<CirclizeVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'hole', 'Hole', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const circlizeVar = parametricVariation(
  'circlizeVar',
  CirclizeVarParams,
  CirclizeVarParamsDefaults,
  CirclizeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const absx = abs(pos.x)
    const absy = abs(pos.y)
    let side = pos.x
    let perimeter = pos.y

    if (absx >= absy) {
      if (pos.x >= absy) {
        perimeter = absx + pos.y
      } else {
        perimeter = 5.0 * absx - pos.y
      }
      side = absx
    } else {
      if (pos.y >= absx) {
        perimeter = 3.0 * absy - pos.x
      } else {
        perimeter = 7.0 * absy + pos.x
      }
      side = absy
    }

    const r = (4.0 / PI.$) * side + P.hole
    const a = ((PI.$ / 4.0) * perimeter) / side - PI.$ / 4.0
    const cosa = cos(a)
    const sina = sin(a)

    return vec2f(r * cosa, r * sina).mul(varInfo.weight)
  },
  'general',
)
