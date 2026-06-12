import { f32, struct, vec2f } from 'typegpu/data'
import { acos, cos, cosh, log, select, sin, sinh, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const EJuliaVarParams = struct({
  power: f32,
})
type EJuliaVarParams = Infer<typeof EJuliaVarParams>
const EJuliaVarParamsDefaults: EJuliaVarParams = {
  power: 2.0,
}
const EJuliaVarParamsEditor: EditorFor<EJuliaVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)
export const ejuliaVar = parametricVariation(
  'ejuliaVar',
  EJuliaVarParams,
  EJuliaVarParamsDefaults,
  EJuliaVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let x = pos.x
    let r2 = pos.x * pos.x + pos.y * pos.y
    const negPower = P.power < 0.0
    const invR2 = 1.0 / select(r2, 1.0e-9, r2 === 0.0)
    x = select(x, x * invR2, negPower)
    r2 = select(r2, invR2, negPower)
    const tmp = r2 + 1.0
    const tmp2 = 2.0 * x
    let xmax = (sqrt(tmp + tmp2) + sqrt(tmp - tmp2)) * 0.5
    xmax = select(xmax, 1.0, xmax < 1.0)
    const mu = log(xmax + sqrt(xmax * xmax - 1.0))
    let t = x / xmax
    t = select(t, 1.0, t > 1.0)
    t = select(t, -1.0, t < -1.0)
    const nu = acos(t)
    const p = select(P.power, -P.power, P.power < 0.0) * 0.5
    const mu_p = mu * p
    const nu_p = nu * p
    const sinhmu = sinh(mu_p)
    const coshmu = cosh(mu_p)
    let sinnu = sin(nu_p)
    const cosnu = cos(nu_p)
    if (pos.y < 0.0) sinnu = -sinnu
    const newX = varInfo.weight * coshmu * cosnu
    const newY = varInfo.weight * sinhmu * sinnu
    return vec2f(newX, newY)
  },
  'general',
)
