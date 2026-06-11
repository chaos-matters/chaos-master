import { f32, struct, vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type StripfitVarParams = Infer<typeof StripfitVarParams>
const StripfitVarParams = struct({
  dx: f32,
})

const StripfitVarParamsDefaults: StripfitVarParams = {
  dx: 1.0,
}

const StripfitVarParamsEditor: EditorFor<StripfitVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'dx', 'DX')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const stripfitVar = parametricVariation(
  'stripfitVar',
  StripfitVarParams,
  StripfitVarParamsDefaults,
  StripfitVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const w = varInfo.weight
    const dxp = -0.5 * P.dx
    const resX = w * pos.x
    const _resY = 0.0
    const y = pos.y
    const y_gt_1 = y > 1.0
    const y_lt_n1 = y < -1.0
    const fity1 = (y + 1.0) % 2.0
    const dy1 = w * (-1.0 + fity1)
    const dx1 = (y - fity1 + 1.0) * dxp
    const fity2 = (y - 1.0) % 2.0
    const dy2 = w * (1.0 + fity2)
    const dx2 = (y - fity2 - 1.0) * dxp
    const dy3 = w * y
    const dx3 = f32(0.0)
    const dX_final = select(dx3, select(dx2, dx1, y_gt_1), y_gt_1 || y_lt_n1)
    const dY_final = select(dy3, select(dy2, dy1, y_gt_1), y_gt_1 || y_lt_n1)
    return vec2f(resX + dX_final, dY_final)
  },
  'general',
)
