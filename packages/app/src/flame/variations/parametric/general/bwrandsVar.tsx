import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, floor, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BWRandsVarParams = struct({
  cellsize: f32,
  space: f32,
  inner_twist: f32,
  outer_twist: f32,
  angle: f32,
})
type BWRandsVarParams = Infer<typeof BWRandsVarParams>
const BWRandsVarParamsDefaults: BWRandsVarParams = {
  cellsize: 1.0,
  space: 0.0,
  inner_twist: 0.0,
  outer_twist: 0.0,
  angle: 0.0,
}
const BWRandsVarParamsEditor: EditorFor<BWRandsVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'cellsize', ' Cell Size ')}
      min={0.1}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space', 'Space')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'inner_twist', ' Inner Twist ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'outer_twist', ' Outer Twist ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle')}
      min={0}
      max={360}
      step={1}
    />
  </>
)
export const bwrandsVar = parametricVariation(
  'bwrandsVar',
  BWRandsVarParams,
  BWRandsVarParamsDefaults,
  BWRandsVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const Ssz = P.cellsize
    const Ssp = P.space
    const Aan = P.angle * 0.0174532925 // Deg to rad
    const ix = f32(floor((pos.x + 0.5 * Ssz) / Ssz))
    const iy = f32(floor((pos.y + 0.5 * Ssz) / Ssz))
    const Cx = ix * Ssz
    const Cy = iy * Ssz
    const Lx = pos.x - Cx
    const Ly = pos.y - Cy
    const sum = abs(ix) + abs(iy)
    const isEven = sum % 2.0 < 0.5
    const _g1 = 1.0 - Ssp * 0.5
    const _g2 = 1.0 - Ssp
    const _r2 = 0.25 * Ssz * Ssz
    const _rfactor = Ssz * Ssz * 0.125
    const Lx1 = Lx / _g1
    const Ly1 = Ly / _g1
    let r1 = Lx1 * Lx1 + Ly1 * Ly1
    let Vv2_1 = f32(0.0)
    const cond1 = r1 < _r2
    const term1 = sqrt(r1)
    const flwr = term1 / (0.5 * Ssz)
    const Vv2_1_sub =
      (0.5 * Ssz + (term1 - 0.5 * Ssz) * (1.0 - flwr)) / (term1 + 1.0e-6)
    Vv2_1 = select(f32(1.0), Vv2_1_sub, cond1)
    r1 = select(f32(1.0), (Vv2_1 * r1) / _r2, cond1) // if not cond1, r=1.0 ?
    const r1_final = select(r1 / _r2, (Vv2_1 * r1) / _r2, cond1)
    const Lx2 = Lx * _g2
    const Ly2 = Ly * _g2
    const denom = (Lx2 * Lx2 + Ly2 * Ly2) / (4.0 * Ssz) + 1.0
    const r2_factor = _rfactor / denom
    const Lx2_f = Lx2 * r2_factor
    const Ly2_f = Ly2 * r2_factor
    const Vv2_2 = sqrt(Ssz)
    const r2_mag = Lx2_f * Lx2_f + Ly2_f * Ly2_f
    const r2_final = (Vv2_2 * r2_mag) / _r2
    const r = select(r2_final, r1_final, isEven)
    const theta = P.inner_twist * (1.0 - r) + P.outer_twist * r
    const s = sin(theta + Aan)
    const c = cos(theta + Aan)
    const Vx = c * Lx + s * Ly
    const Vy = -s * Lx + c * Ly
    const finalX = Cx + Vx
    const finalY = Cy + Vy
    const newX = varInfo.weight * finalX
    const newY = varInfo.weight * finalY
    return vec2f(newX, newY)
  },
  'general',
)
