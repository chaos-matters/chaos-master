import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, exp, floor, log, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const NPolarVarParams = struct({
  n: f32,
  parity: f32,
})
type NPolarVarParams = Infer<typeof NPolarVarParams>
const NPolarVarParamsDefaults: NPolarVarParams = {
  n: 6.0,
  parity: 0.0,
}
const NPolarVarParamsEditor: EditorFor<NPolarVarParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'n', 'N')} min={0} max={20} step={1} />
    <RangeEditor
      {...editorProps(props, 'parity', 'Parity')}
      min={0}
      max={5}
      step={1}
    />
  </>
)
export const nPolarVar = parametricVariation(
  'nPolarVar',
  NPolarVarParams,
  NPolarVarParamsDefaults,
  NPolarVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const n = floor(P.n)
    const parity = floor(P.parity)
    const nnz = select(n, 1.0, n === 0.0)
    const vvar = varInfo.weight / PI.$
    const vvar_2 = vvar * 0.5
    const absn = abs(nnz)
    const isOdd = abs(parity) % 2.0 >= 0.5 // Treat as boolean logic for float modulo
    const valX = select(vvar * atan2(pos.x, pos.y), pos.x, isOdd)
    const valY = select(
      vvar_2 * log(pos.x * pos.x + pos.y * pos.y),
      pos.y,
      isOdd,
    )
    const randStep = f32(floor(random() * 65536.0)) % absn
    const angle = (atan2(valY, valX) + 2.0 * PI.$ * randStep) / nnz
    const cn = 1.0 / (2.0 * nnz)
    const d2 = valX * valX + valY * valY
    const finalR = select(0.0, exp(log(d2) * cn), d2 > 0.0000001)
    const sinA = sin(angle)
    const cosA = cos(angle)
    const resX = select(finalR * cosA, finalR * sinA, isOdd)
    const resY = select(finalR * sinA, finalR * cosA, isOdd)
    return vec2f(resX, resY)
  },
  'general',
)
