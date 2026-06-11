import { f32, struct, vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BarycentroidVarParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
})
type BarycentroidVarParams = Infer<typeof BarycentroidVarParams>
const BarycentroidVarParamsDefaults: BarycentroidVarParams = {
  a: 0.0,
  b: 1.0,
  c: 1.0,
  d: 1.0,
}
const BarycentroidVarParamsEditor: EditorFor<BarycentroidVarParams> = (
  props,
) => (
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
    <RangeEditor
      {...editorProps(props, 'd', 'D')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)
export const barycentroidVar = parametricVariation(
  'barycentroidVar',
  BarycentroidVarParams,
  BarycentroidVarParamsDefaults,
  BarycentroidVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const dot00 = P.a * P.a + P.b * P.b
    const dot01 = P.a * P.c + P.b * P.d
    const dot02 = P.a * pos.x + P.b * pos.y
    const dot11 = P.c * P.c + P.d * P.d
    const dot12 = P.c * pos.x + P.d * pos.y
    const denom = dot00 * dot11 - dot01 * dot01
    const invDenom = 1.0 / select(denom, 1.0e-10, denom === 0.0)
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom
    const newX = varInfo.weight * u
    const newY = varInfo.weight * v
    return vec2f(newX, newY)
  },
  'general',
)
