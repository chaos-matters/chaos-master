import { tgpu } from 'typegpu'
import { arrayOf, f32, i32, struct, vec2f } from 'typegpu/data'
import { cos, floor, pow, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS_TINY, PI } from '@/flame/constants'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const HexesVarParams = struct({
  cellsize: f32,
  power: f32,
  rotate: f32,
  scale: f32,
})

type HexesVarParams = Infer<typeof HexesVarParams>

const HexesVarParamsDefaults: HexesVarParams = {
  cellsize: 0.1,
  power: 1.0,
  rotate: 0,
  scale: 0.75,
}

const HexesVarParamsEditor: EditorFor<HexesVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'cellsize', 'Cell Size')}
      min={0.01}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={0}
      max={5}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'rotate', 'Rotate')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0}
      max={3}
      step={0.01}
    />
  </>
)

const cell_centre = (xi: number, yi: number, size: number) => {
  'use gpu'
  const a_cart = 1.5
  const b_cart = -1.5
  const c_cart = 1.73205080757 / 2.0
  const d_cart = 1.73205080757 / 2.0
  const x = f32(xi)
  const y = f32(yi)
  return vec2f(
    (a_cart * x + b_cart * y) * size,
    (c_cart * x + d_cart * y) * size,
  )
}

const PointsArray = arrayOf(vec2f, 7)
const NeighborArray = arrayOf(vec2f, 9)
const voronoi = tgpu.fn(
  [f32, f32, PointsArray],
  f32,
)((px, py, P_points) => {
  let ratiomax = f32(-1.0e20)
  const center = P_points[0]!

  // loop 1..6 (neighbors against center)
  for (let i = 1; i < 7; i++) {
    const neighbor = P_points[i]!
    const PmQx = neighbor.x - center.x
    const PmQy = neighbor.y - center.y

    if (PmQx === 0.0 && PmQy === 0.0) {
      // should not happen for distinct points
    } else {
      const term =
        f32(2.0) *
        (((px - center.x) * PmQx + (py - center.y) * PmQy) /
          (PmQx * PmQx + PmQy * PmQy))
      if (term > ratiomax) {
        ratiomax = term
      }
    }
  }
  return ratiomax
})

// const voronoi = (px: number, py: number, P_points: v2f[]) => {}
export const hexesVar = parametricVariation(
  'hexesVar',
  HexesVarParams,
  HexesVarParamsDefaults,
  HexesVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'

    const s = P.cellsize
    if (s === 0.0) {
      return vec2f(0.0, 0.0)
    }

    const a_hex = f32(1.0 / 3.0)
    const b_hex = f32(1.73205080757 / 3.0)
    const c_hex = f32(-1.0 / 3.0)
    const d_hex = f32(1.73205080757 / 3.0)

    const Ux = f32(pos.x)
    const Uy = f32(pos.y)

    let Hx = i32(floor((a_hex * Ux + b_hex * Uy) / s))
    let Hy = i32(floor((c_hex * Ux + d_hex * Uy) / s))

    // determine closest center
    const P_arr = NeighborArray()
    let minDistSq = 1.0e32
    let closestIdx = 0

    let idx = 0
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const center = cell_centre(Hx + di, Hy + dj, s)
        P_arr[idx] = center

        const dx = center.x - Ux
        const dy = center.y - Uy
        const distSq = dx * dx + dy * dy
        if (distSq < minDistSq) {
          minDistSq = distSq
          closestIdx = idx
        }
        idx++
      }
    }

    // re-center Hx, Hy based on closest
    // map linear index back to di, dj
    const q_di = i32(closestIdx / 3.0) - 1.0
    const q_dj = i32(closestIdx % 3.0) - 1.0

    Hx += q_di
    Hy += q_dj

    // build the 7 points for Voronoi calc
    // 0: Center
    // 1-6: Neighbors
    const P_points = [
      vec2f(0, 0),
      vec2f(0, 0),
      vec2f(0, 0),
      vec2f(0, 0),
      vec2f(0, 0),
      vec2f(0, 0),
      vec2f(0, 0),
    ]
    P_points[0] = cell_centre(Hx, Hy, s)
    P_points[1] = cell_centre(Hx, Hy + 1, s)
    P_points[2] = cell_centre(Hx + 1, Hy + 1, s)
    P_points[3] = cell_centre(Hx + 1, Hy, s)
    P_points[4] = cell_centre(Hx, Hy - 1, s)
    P_points[5] = cell_centre(Hx - 1, Hy - 1, s)
    P_points[6] = cell_centre(Hx - 1, Hy, s)

    // returns max ratio
    const L1 = f32(voronoi(Ux, Uy, P_points))

    const DXo = Ux - P_points[0].x
    const DYo = Uy - P_points[0].y

    const trgL = f32(pow(L1 + EPS_TINY.$, P.power) * P.scale)

    const rotSin = sin(P.rotate * 2.0 * PI.$)
    const rotCos = cos(P.rotate * 2.0 * PI.$)

    let Vx = DXo * rotCos + DYo * rotSin
    let Vy = -DXo * rotSin + DYo * rotCos

    const Ux2 = f32(Vx + P_points[0].x)
    const Uy2 = f32(Vy + P_points[0].y)

    const L2 = f32(voronoi(Ux2, Uy2, P_points))

    const L = select(L2, L1, L1 > L2)
    let R = f32(0.0)

    if (L < 0.5) {
      R = trgL / L1
    } else if (L > 0.8) {
      R = trgL / L2
    } else {
      R = ((trgL / L1) * (0.8 - L) + (trgL / L2) * (L - 0.5)) / 0.3
    }

    Vx *= R
    Vy *= R

    Vx += P_points[0].x
    Vy += P_points[0].y

    return vec2f(Vx, Vy)
  },
)
