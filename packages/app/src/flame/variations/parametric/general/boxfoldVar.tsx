import { f32, struct, vec2f } from 'typegpu/data'
import { cos, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BoxfoldVarParams = struct({
  foldLimit: f32,
  rotateX: f32,
  rotateY: f32,
  rotateZ: f32,
})
type BoxfoldVarParams = Infer<typeof BoxfoldVarParams>
const BoxfoldVarParamsDefaults: BoxfoldVarParams = {
  foldLimit: 1.0,
  rotateX: 0.0,
  rotateY: 0.0,
  rotateZ: 0.0,
}
const BoxfoldVarParamsEditor: EditorFor<BoxfoldVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'foldLimit', ' Fold Limit ')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'rotateX', ' Rotate X ')}
      min={0}
      max={6.28}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'rotateY', ' Rotate Y ')}
      min={0}
      max={6.28}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'rotateZ', ' Rotate Z ')}
      min={0}
      max={6.28}
      step={0.01}
    />
  </>
)
export const boxfoldVar = parametricVariation(
  'boxfoldVar',
  BoxfoldVarParams,
  BoxfoldVarParamsDefaults,
  BoxfoldVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let px = pos.x
    px = select(px, 2.0 * P.foldLimit - px, px > P.foldLimit)
    px = select(px, -2.0 * P.foldLimit - px, px < -P.foldLimit)
    let py = pos.y
    py = select(py, 2.0 * P.foldLimit - py, py > P.foldLimit)
    py = select(py, -2.0 * P.foldLimit - py, py < -P.foldLimit)
    let pz = pos.x - pos.x
    const cosZ = cos(P.rotateZ)
    const sinZ = sin(P.rotateZ)
    const tx_z = px * cosZ - py * sinZ
    const ty_z = px * sinZ + py * cosZ
    px = select(px, tx_z, P.rotateZ !== 0.0)
    py = select(py, ty_z, P.rotateZ !== 0.0)
    const cosY = cos(P.rotateY)
    const sinY = sin(P.rotateY)
    const tx_y = px * cosY + pz * sinY
    const tz_y = -px * sinY + pz * cosY
    px = select(px, tx_y, P.rotateY !== 0.0)
    pz = select(pz, tz_y, P.rotateY !== 0.0)
    const cosX = cos(P.rotateX)
    const sinX = sin(P.rotateX)
    const ty_x = py * cosX - pz * sinX
    py = select(py, ty_x, P.rotateX !== 0.0)
    const newX = varInfo.weight * px
    const newY = varInfo.weight * py
    return vec2f(newX, newY)
  },
  'general',
)
