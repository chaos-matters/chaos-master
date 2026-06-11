import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, exp, pow, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type FloraParams = Infer<typeof FloraParams>
const FloraParams = struct({
  leafType: f32,
  filled: f32,
  scale: f32,
  distort: f32,
  shapeMod: f32,
})

const FloraDefaults: FloraParams = {
  leafType: 0.0,
  filled: 1.0,
  scale: 1.0,
  distort: 0.1,
  shapeMod: 0.5,
}

const FloraEditor: EditorFor<FloraParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'leafType', 'Type')}
      min={0}
      max={24}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'filled', 'Filled')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0.1}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'distort', 'Distort')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'shapeMod', 'Shape')}
      min={-2}
      max={2}
      step={0.01}
    />
  </>
)

export const floraVar = parametricVariation(
  'floraVar',
  FloraParams,
  FloraDefaults,
  FloraEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const ox = pos.x
    const oy = pos.y
    let t = atan2(oy, ox)

    const fillRandom = random()
    const r = select(1.0, random(), P.filled > 0.0 && P.filled > fillRandom)

    let lx = pos.x
    let ly = pos.y
    const sm = P.shapeMod
    const PI2 = PI.$ / 2.0

    if (P.leafType < 1.0) {
      t = t + PI2
      let gr = pos.x - pos.x
      if (sin(t) > 0.0) {
        gr = 1.0 - sm * 0.8 * pow(cos(t), 50.0)
        gr = gr * (1.0 + 0.05 * cos(8.0 * t))
      }
      lx = gr * cos(t)
      ly = gr * sin(t)
    } else if (P.leafType < 2.0) {
      t = t + PI2
      const cr =
        (1.0 + (0.5 + sm * 0.8) * cos(8.0 * t)) *
        (1.0 + 0.1 * cos(24.0 * t)) *
        (0.9 + 0.05 * cos(200.0 * t)) *
        (1.0 + sin(t))
      lx = cr * sin(t)
      ly = -cr * cos(t)
    } else if (P.leafType < 3.0) {
      const em2 = -6.0 * sm + 0.5
      t = t + PI.$ / 4.0
      const clr =
        (1.0 + 0.8 * cos(4.0 * t)) *
        (1.0 - (0.5 + em2 * 0.5) * pow(sin(4.0 * t), 2.0))
      lx = clr * cos(t)
      ly = clr * sin(t)
    } else if (P.leafType < 4.0) {
      t = t + PI2
      let rr3 = sin(t)
      if (rr3 < 0.0) rr3 = 0.0
      rr3 = rr3 * (1.0 + sm * 0.1 * cos(40.0 * t))
      lx = rr3 * cos(t) * 0.7
      ly = rr3 * sin(t)
    } else if (P.leafType < 5.0) {
      t = t + PI2
      const dr = 0.6 * (1.2 + cos((8.0 + sm * 16.0) * t))
      lx = dr * cos(t)
      ly = dr * sin(t)
    } else if (P.leafType < 6.0) {
      t = t + PI2
      const br =
        (exp(cos(t)) - 2.0 * cos(4.0 * t) + pow(sin(t / 12.0), 5.0)) *
        (0.7 + sm * 0.6)
      lx = br * sin(t)
      ly = -br * cos(t)
    } else if (P.leafType < 7.0) {
      t = t + PI2
      const or_ =
        (1.0 + 0.8 * sin(t)) * (1.0 + (0.1 + sm * 0.2) * cos(14.0 * t))
      lx = or_ * sin(t)
      ly = -or_ * cos(t)
    } else if (P.leafType < 8.0) {
      t = t + PI2
      const tr = (1.0 - 0.9 * sin(t)) * (1.0 + 0.02 * cos(60.0 * t))
      lx = tr * cos(t) * (0.6 + sm * 0.4)
      ly = tr * sin(t)
    } else if (P.leafType < 9.0) {
      const lr = 1.0 + 0.05 * cos(12.0 * t)
      const co = 0.1 + sm * 0.4
      lx = lr * cos(t)
      ly = lr * sin(t) + co * (1.0 - lr)
    } else if (P.leafType < 10.0) {
      t = t + PI2
      let sr = (1.0 - 0.5 * sin(t)) * (1.0 + (0.1 + sm * 0.4) * cos(5.0 * t))
      sr = sr * (1.0 + 0.05 * cos(25.0 * t))
      lx = sr * sin(t)
      ly = -sr * cos(t)
    } else if (P.leafType < 11.0) {
      t = t + PI2
      const ar_ = select(
        0.0,
        sin(t) * (1.0 + (0.05 + sm * 0.3) * cos(30.0 * t)),
        sin(t) > 0.0,
      )
      lx = ar_ * cos(t) * 0.6
      ly = ar_ * sin(t)
    } else if (P.leafType < 12.0) {
      t = t + PI2
      let mbr = 1.0 - 0.9 * sin(t)
      if (mbr < 0.0) mbr = 0.0
      const fen =
        (1.0 - sm * 0.8 * pow(sin(t * 2.5), 10.0)) *
        (1.0 - sm * 0.7 * pow(cos(t * 3.5), 10.0))
      const mr = mbr * fen
      lx = mr * cos(t)
      ly = mr * sin(t)
    } else if (P.leafType < 13.0) {
      t = t + PI2
      const air = 1.0 + (0.2 + sm * 0.4) * cos(8.0 * t)
      lx = air * cos(t)
      ly = air * sin(t)
    } else if (P.leafType < 14.0) {
      t = t + PI2
      const sd = 0.15 + sm * 0.2
      const hr = 1.0 - sd * abs(sin(t * 5.0))
      lx = hr * cos(t) * 0.7
      ly = hr * sin(t)
    } else if (P.leafType < 15.0) {
      t = t + PI2
      const spd = 0.3 + sm * 0.4
      const sv = 1.0 - spd * abs(sin(t * 2.5))
      const ss = 1.0 + 0.04 * cos(40.0 * t)
      const swr = sv * ss
      lx = swr * cos(t)
      ly = swr * sin(t)
    } else if (P.leafType < 16.0) {
      t = t + PI2
      const ld = 0.1 + sm * 0.2
      const bs = 1.0 + ld * cos(3.0 * t) - ld * 0.5 * cos(5.0 * t)
      const srr = 1.0 + 0.03 * cos(20.0 * t) + 0.02 * cos(35.0 * t)
      const grr = bs * srr
      lx = grr * cos(t)
      ly = grr * sin(t)
    } else if (P.leafType < 17.0) {
      t = t + PI2
      const cld = 0.3 + sm * 0.5
      const cbs = 1.0 + cld * cos(7.0 * t)
      const csr = 1.0 + 0.05 * cos(42.0 * t)
      const crr = cbs * csr
      lx = crr * cos(t)
      ly = crr * sin(t)
    } else if (P.leafType < 18.0) {
      t = t + PI2
      const hbr = 1.0 - 0.9 * sin(t)
      const wv = 0.02 + sm * 0.05
      const hr2 = hbr * (1.0 + wv * sin(10.0 * t))
      lx = hr2 * cos(t) * 1.2
      ly = hr2 * sin(t)
    } else if (P.leafType < 19.0) {
      t = atan2(oy, ox)
      const abr = 1.0 - sin(t)
      const ald = 1.0 - (0.1 + sm * 0.4) * pow(cos(t), 2.0)
      let ar2 = abr * ald
      ar2 = ar2 * (1.0 + 0.03 * sin(15.0 * t))
      lx = ar2 * cos(t) * 0.7
      ly = ar2 * sin(t)
    } else if (P.leafType < 20.0) {
      t = t + PI2
      const dr2 = 0.8 * (1.1 + cos((20.0 + sm * 40.0) * t) * 0.3)
      lx = dr2 * cos(t)
      ly = dr2 * sin(t)
    } else if (P.leafType < 21.0) {
      t = t + PI2
      const cr2 = 1.0 + sin(t) + (0.2 + sm * 0.6) * sin(5.0 * t - PI2)
      lx = cr2 * cos(t)
      ly = cr2 * sin(t)
    } else if (P.leafType < 22.0) {
      t = atan2(oy, ox)
      const bbr = 1.0 - 0.9 * sin(t)
      const ps = 1.0 + 0.05 * cos(20.0 * t)
      const ss2 = 1.0 + (0.02 + sm * 0.03) * cos(40.0 * t)
      const br2 = bbr * ps * ss2
      lx = br2 * cos(t) * 0.8
      ly = br2 * sin(t)
    } else if (P.leafType < 23.0) {
      t = t + PI2
      const tur = pow(abs(cos(t)), 0.3) + pow(abs(sin(t)), 2.0 + sm * 2.0)
      lx = tur * sin(t)
      ly = -tur * cos(t) * 0.6
    } else if (P.leafType < 24.0) {
      t = t + PI2
      const lr2 = 1.0 - 0.9 * sin(t + (sm - 0.5) * 0.2)
      lx = lr2 * sin(t) * 1.1
      ly = -lr2 * cos(t)
    } else {
      t = atan2(oy, ox) * (2.0 + sm * 4.0) * PI.$
      const fr = 0.05 * t
      lx = fr * cos(t)
      ly = fr * sin(t)
    }

    lx = lx + P.distort * sin(oy * 5.0)
    ly = ly + P.distort * cos(ox * 5.0)

    return vec2f(r * lx * P.scale, r * ly * P.scale).mul(varInfo.weight)
  },
  'general',
)
