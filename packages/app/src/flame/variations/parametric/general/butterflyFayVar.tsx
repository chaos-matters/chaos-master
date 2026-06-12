import { f32, struct, vec2f } from 'typegpu/data'
import { abs, floor, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ButterflyFayVarParams = struct({
  curve_type: f32,
  inner_spread: f32,
  inner_spread_ratio: f32,
  flip: f32,
  beta: f32,
})
type ButterflyFayVarParams = Infer<typeof ButterflyFayVarParams>
const ButterflyFayVarParamsDefaults: ButterflyFayVarParams = {
  curve_type: 0.0,
  inner_spread: 0.0,
  inner_spread_ratio: 0.0,
  flip: 0.0,
  beta: 1.0,
}
const ButterflyFayVarParamsEditor: EditorFor<ButterflyFayVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'curve_type', ' Curve Type ')}
      min={0}
      max={6}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'inner_spread', ' Inner Spread ')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'inner_spread_ratio', ' Spread Ratio ')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'flip', 'Flip')}
      min={0}
      max={1}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'beta', 'Beta')}
      min={0}
      max={5}
      step={0.01}
    />
  </>
)
export const butterflyFayVar = parametricVariation(
  'butterflyFayVar',
  ButterflyFayVarParams,
  ButterflyFayVarParamsDefaults,
  ButterflyFayVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const type = floor(P.curve_type)
    const x = pos.x
    const y = pos.y
    let outX = pos.x - pos.x
    let outY = pos.y - pos.y
    const c0_x = x
    const c0_y = y
    const c1_x = x - P.inner_spread * P.inner_spread_ratio * x
    const c1_y = y - P.inner_spread * y
    const xin = abs(x)
    const yin = abs(y)
    const c2_x = x - P.inner_spread * P.inner_spread_ratio * (x - xin)
    const c2_y = y - P.inner_spread * (y - yin)
    const c3_x = x - P.inner_spread * P.inner_spread_ratio * abs(x)
    const c3_y = y - P.inner_spread * abs(y)
    outX = select(outX, c0_x, type === 0.0)
    outY = select(outY, c0_y, type === 0.0)
    outX = select(outX, c1_x, type === 1.0)
    outY = select(outY, c1_y, type === 1.0)
    outX = select(outX, c2_x, type === 2.0)
    outY = select(outY, c2_y, type === 2.0)
    outX = select(outX, c3_x, type === 3.0)
    outY = select(outY, c3_y, type === 3.0)
    const newX = varInfo.weight * outX
    const newY = varInfo.weight * outY
    return vec2f(newX, newY)
  },
  'general',
)
