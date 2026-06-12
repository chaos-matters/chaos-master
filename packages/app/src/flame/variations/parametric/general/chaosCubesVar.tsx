import { f32, i32, struct, vec2f } from 'typegpu/data'
import { cos, floor, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ChaosCubesVarParams = struct({
  mode: f32,
  mode7_A: f32,
  mode7_B: f32,
  depth: f32,
  twistX: f32,
  twistY: f32,
  twistZ: f32,
  scaleX: f32,
  scaleY: f32,
  scaleZ: f32,
  offset: f32,
  rotX: f32,
  rotY: f32,
  rotZ: f32,
  invert: f32,
  julia: f32,
  sphereInvert: f32,
  sphereRadius: f32,
})
type ChaosCubesVarParams = Infer<typeof ChaosCubesVarParams>
const ChaosCubesVarParamsDefaults: ChaosCubesVarParams = {
  mode: 0,
  mode7_A: 0,
  mode7_B: 1,
  depth: 5,
  twistX: 0.0,
  twistY: 0.0,
  twistZ: 0.0,
  scaleX: 0.3333333,
  scaleY: 0.3333333,
  scaleZ: 0.3333333,
  offset: 1.0,
  rotX: 0.0,
  rotY: 0.0,
  rotZ: 0.0,
  invert: 0,
  julia: 0,
  sphereInvert: 0,
  sphereRadius: 1.0,
}
const ChaosCubesVarParamsEditor: EditorFor<ChaosCubesVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'mode', 'Mode')}
      min={0}
      max={7}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'depth', 'Depth')}
      min={1}
      max={15}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'scaleX', ' Scale X ')}
      min={0}
      max={2}
    />
    <RangeEditor {...editorProps(props, 'offset', 'Offset')} min={0} max={5} />
    <RangeEditor
      {...editorProps(props, 'invert', 'Invert')}
      min={0}
      max={1}
      step={1}
    />
  </>
)
export const chaosCubesVar = parametricVariation(
  'chaosCubesVar',
  ChaosCubesVarParams,
  ChaosCubesVarParamsDefaults,
  ChaosCubesVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let px = pos.x
    let py = pos.y
    let pz = pos.x - pos.x
    const rX = P.rotX * 0.017453
    const rY = P.rotY * 0.017453
    const rZ = P.rotZ * 0.017453
    if (P.rotX !== 0.0) {
      const c = cos(rX)
      const s = sin(rX)
      const ny = py * c - pz * s
      const nz = py * s + pz * c
      py = ny
      pz = nz
    }
    if (P.rotY !== 0.0) {
      const c = cos(rY)
      const s = sin(rY)
      const nx = px * c + pz * s
      const nz = -px * s + pz * c
      px = nx
      pz = nz
    }
    if (P.rotZ !== 0.0) {
      const c = cos(rZ)
      const s = sin(rZ)
      const nx = px * c - py * s
      const ny = px * s + py * c
      px = nx
      py = ny
    }
    const cx = px
    const cy = py
    const cz = pz
    const max_iter = i32(P.depth)
    for (let i = 0; i < max_iter; i++) {
      let cmode = i32(P.mode)
      if (cmode === i32(7)) {
        cmode = select(i32(P.mode7_B), i32(P.mode7_A), random() < 0.5)
      }
      if (cmode < i32(6)) {
        const rx = f32(floor(random() * 3.0)) - 1.0
        const ry = f32(floor(random() * 3.0)) - 1.0
        const rz = f32(floor(random() * 3.0)) - 1.0
        px = px * P.scaleX - rx * P.offset * (1.0 - P.scaleX)
        py = py * P.scaleY - ry * P.offset * (1.0 - P.scaleY)
        pz = pz * P.scaleZ - rz * P.offset * (1.0 - P.scaleZ)
        if (P.julia > 0.5) {
          px += cx
          py += cy
          pz += cz
        }
      } else {
        const vIdx = f32(floor(random() * 5.0))
        let vx = pos.x - pos.x
        let vy = pos.y - pos.y
        let vz = pos.x - pos.x
        const off = P.offset
        vx = select(
          0.0,
          select(-off, off, vIdx === 0.0 || vIdx === 1.0),
          vIdx < 4.0,
        )
        vy = select(
          0.0,
          select(off, -off, vIdx === 1.0 || vIdx === 2.0),
          vIdx < 4.0,
        )
        vz = select(off * P.scaleY * 0.5, 0.0, vIdx < 4.0)
        px = (px + vx) * 0.5
        py = (py + vy) * 0.5
        pz = (pz + vz) * 0.5
      }
      if (P.twistX !== 0.0) {
        const ang = px * P.twistX
        const c = cos(ang)
        const s = sin(ang)
        const ny = py * c - pz * s
        const nz = py * s + pz * c
        py = ny
        pz = nz
      }
    }
    if (P.sphereInvert > 0.5) {
      const r2 = px * px + py * py + pz * pz
      const factor = (P.sphereRadius * P.sphereRadius) / (r2 + 1.0e-9)
      px *= factor
      py *= factor
      pz *= factor
    }
    const newX = varInfo.weight * px
    const newY = varInfo.weight * py
    return vec2f(newX, newY)
  },
  'general',
)
