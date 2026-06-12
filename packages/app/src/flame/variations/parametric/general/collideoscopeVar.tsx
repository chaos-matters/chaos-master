import { f32, i32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CollideoscopeVarParams = struct({
  a: f32,
  num: i32,
})

type CollideoscopeVarParams = Infer<typeof CollideoscopeVarParams>

const CollideoscopeVarParamsDefaults: CollideoscopeVarParams = {
  a: 0.2,
  num: 1,
}

const CollideoscopeVarParamsEditor: EditorFor<CollideoscopeVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={0.01}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'num', 'Num', props.dataParameterPath)}
      min={1}
      max={20}
      step={1}
    />
  </>
)

export const collideoscopeVar = parametricVariation(
  'collideoscopeVar',
  CollideoscopeVarParams,
  CollideoscopeVarParamsDefaults,
  CollideoscopeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const numf = f32(P.num)
    const knPi = 1.0 / (numf * PI.$)
    const piKn = PI.$ / numf
    const kaKn = (PI.$ * P.a) / (2.0 * numf)

    let a = pos.x
    const a0 = atan2(pos.y, pos.x)
    if (a0 >= 0.0) {
      const alt = i32(a0 * knPi)
      if (alt % 2 === 0) {
        a = f32(alt) * piKn + ((kaKn + a0) % piKn)
      } else {
        a = f32(alt) * piKn + ((-kaKn + a0) % piKn)
      }
    } else {
      const alt = i32(-a0 * knPi)
      if (alt % 2 !== 0) {
        a = -(f32(alt) * piKn + ((-kaKn - a0) % piKn))
      } else {
        a = -(f32(alt) * piKn + ((kaKn - a0) % piKn))
      }
    }

    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    return vec2f(r * cos(a), r * sin(a)).mul(varInfo.weight)
  },
  'general',
)
