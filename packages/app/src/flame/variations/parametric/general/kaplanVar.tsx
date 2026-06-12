import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, floor, log, pow, select, sign, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const KaplanVarParams = struct({
  seed: f32,
  n: f32,
  time: f32,
  invert: f32,
})
type KaplanVarParams = Infer<typeof KaplanVarParams>
const KaplanVarParamsDefaults: KaplanVarParams = {
  seed: 1000.0,
  n: 800.0,
  time: 10.0,
  invert: 0.0,
}
const KaplanVarParamsEditor: EditorFor<KaplanVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'n', 'N')}
      min={50}
      max={1500}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'time', 'Time')}
      min={0}
      max={20}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'invert', 'Invert')}
      min={0}
      max={1}
      step={1}
    />
  </>
)
export const kaplanVar = parametricVariation(
  'kaplanVar',
  KaplanVarParams,
  KaplanVarParamsDefaults,
  KaplanVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const rx = floor(P.n * random())
    const ry = floor(P.n * random())
    const zoom = f32(floor(P.time))
    const halfN = f32(floor(P.n / 2.0))
    const xv = zoom * (rx - halfN)
    const yv = zoom * (ry - halfN)
    const r0 = atan2(xv, yv)
    const c = cos(r0)
    const s = sin(r0)
    const uv_x = xv * c - yv * s
    const uv_y = xv * s + yv * c
    const value = uv_x * uv_x + uv_y * uv_y
    const log2 = 0.69314718
    const exponent = f32(floor(log(value) / log2))
    const mantissa = value * pow(2.0, -exponent) - 1.0
    const p16 = f32(65536.0)
    const r = mantissa - f32(floor(mantissa * p16 + 0.5)) / p16
    const color = sign(r)
    let visible = false
    if (P.invert < 0.5) {
      visible = color > 0.0
    } else {
      visible = color <= 0.0
    }
    const outX = select(0.0, rx / P.n - 0.5, visible)
    const outY = select(0.0, ry / P.n - 0.5, visible)
    return vec2f(outX, outY).mul(varInfo.weight)
  },
  'general',
)
