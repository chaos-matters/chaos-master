import { f32, struct, vec2f } from 'typegpu/data'
import { abs, round, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const HexModulusVarParams = struct({
  size: f32,
})

type HexModulusVarParams = Infer<typeof HexModulusVarParams>

const HexModulusVarParamsDefaults: HexModulusVarParams = {
  size: 1.0,
}

const HexModulusVarParamsEditor: EditorFor<HexModulusVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'size', 'Size', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
  </>
)

export const hexModulusVar = parametricVariation(
  'hexModulusVar',
  HexModulusVarParams,
  HexModulusVarParamsDefaults,
  HexModulusVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const hsize = sqrt(3.0) / 2.0 / P.size
    const X = pos.x * hsize
    const Y = pos.y * hsize
    const sx = (sqrt(3.0) / 3.0) * X - Y / 3.0
    const sz = (2.0 * Y) / 3.0
    const sy = -sx - sz
    const rx = round(sx)
    const ry = round(sy)
    const rz = round(sz)
    const xDiff = abs(rx - sx)
    const yDiff = abs(ry - sy)
    const zDiff = abs(rz - sz)
    const xMax = xDiff > yDiff && xDiff > zDiff
    const rx_c = select(rx, -ry - rz, xMax)
    const _ry_c = select(ry, -rx - rz, !xMax && yDiff > zDiff)
    const rz_c = select(rz, -rx - ry, !xMax && yDiff <= zDiff)
    const FX_h = sqrt(3.0) * rx_c + (sqrt(3.0) / 2.0) * rz_c
    const FY_h = 1.5 * rz_c

    return vec2f(X - FX_h, Y - FY_h).mul(varInfo.weight)
  },
  'general',
)
