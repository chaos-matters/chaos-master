import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, pow, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Atan2SpiralsVarParams = struct({
  r_mult: f32,
  r_add: f32,
  xy2_mult: f32,
  xy2_add: f32,
  x_mult: f32,
  x_add: f32,
  y_mult: f32,
  y_add: f32,
  r_power: f32,
  x2y2_power: f32,
  sin_add: f32,
})
type Atan2SpiralsVarParams = Infer<typeof Atan2SpiralsVarParams>
const Atan2SpiralsVarParamsDefaults: Atan2SpiralsVarParams = {
  r_mult: 1.0,
  r_add: 0.0,
  xy2_mult: 1.0,
  xy2_add: 0.0,
  x_mult: 1.0,
  x_add: 0.0,
  y_mult: 1.0,
  y_add: 0.0,
  r_power: 1.0,
  x2y2_power: 1.0,
  sin_add: 0.0,
}
const Atan2SpiralsVarParamsEditor: EditorFor<Atan2SpiralsVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'r_mult', ' R Mult ')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'r_add', ' R Add ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xy2_mult', ' XY2 Mult ')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xy2_add', ' XY2 Add ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x_mult', ' X Mult ')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x_add', ' X Add ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y_mult', ' Y Mult ')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y_add', ' Y Add ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'r_power', ' R Power ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x2y2_power', ' X2Y2 Power ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'sin_add', ' Sin Add ')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)
export const atan2SpiralsVar = parametricVariation(
  'atan2SpiralsVar',
  Atan2SpiralsVarParams,
  Atan2SpiralsVarParamsDefaults,
  Atan2SpiralsVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xs = pos.x * pos.x
    const ys = pos.y * pos.y
    const xy2 = pow(xs + ys, P.x2y2_power)
    const r = pow(xs + ys, P.r_power)
    const fx =
      P.x_mult * atan2(r * P.r_mult + P.r_add, xy2 * P.xy2_mult + P.xy2_add) +
      P.x_add
    const fy =
      P.y_mult * sin(xy2 * P.xy2_mult + P.xy2_add + P.sin_add) + P.y_add
    const newX = varInfo.weight * fx
    const newY = varInfo.weight * fy
    return vec2f(newX, newY)
  },
  'general',
)
