import { f32, struct, vec2f } from 'typegpu/data'
import { max, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const JuliaOutsideVarParams = struct({
  reDiv: f32,
  imDiv: f32,
  mode: f32,
})

type JuliaOutsideVarParams = Infer<typeof JuliaOutsideVarParams>

const JuliaOutsideVarParamsDefaults: JuliaOutsideVarParams = {
  reDiv: 1.0,
  imDiv: 0.0,
  mode: 0.0,
}

const JuliaOutsideVarParamsEditor: EditorFor<JuliaOutsideVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'reDiv', 'Re Div', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'imDiv', 'Im Div', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'mode', 'Mode', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={1.0}
    />
  </>
)

// Helper: complex sqrt inline — returns (newRe, newIm) given (re, im)
// sqrt(a+bi): r=sqrt(a²+b²), re'=sqrt((r+a)/2), im'=sign(b)*sqrt((r-a)/2)

export const juliaOutsideVar = parametricVariation(
  'juliaOutsideVar',
  JuliaOutsideVarParams,
  JuliaOutsideVarParamsDefaults,
  JuliaOutsideVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const mode02 = P.mode < 0.5 || P.mode > 1.5 // mode 0 or 2
    const mode01 = P.mode < 1.5 // mode 0 or 1

    // z = pos
    const x = pos.x
    const y = pos.y

    // --- z operations ---
    // sqrt(z) (conditional on mode02)
    const rZ = sqrt(x * x + y * y)
    const sqrtZRe = sqrt(max((rZ + x) * 0.5, 0.0))
    const sqrtZImAbs = sqrt(max((rZ - x) * 0.5, 0.0))
    const sqrtZIm = select(-sqrtZImAbs, sqrtZImAbs, y >= 0.0)

    const z1Re = select(x, sqrtZRe, mode02)
    const z1Im = select(y, sqrtZIm, mode02)

    // z.Inc() — always
    const z2Re = z1Re + 1.0
    const z2Im = z1Im

    // z.Sqr() (conditional on mode02)
    const sqrZRe = z2Re * z2Re - z2Im * z2Im
    const sqrZIm = 2.0 * z2Re * z2Im

    const z3Re = select(z2Re, sqrZRe, mode02)
    const z3Im = select(z2Im, sqrZIm, mode02)

    // --- z2 operations ---
    // sqrt(z2) (conditional on mode02)
    const rZ2 = sqrt(x * x + y * y)
    const sqrtZ2Re = sqrt(max((rZ2 + x) * 0.5, 0.0))
    const sqrtZ2ImAbs = sqrt(max((rZ2 - x) * 0.5, 0.0))
    const sqrtZ2Im = select(-sqrtZ2ImAbs, sqrtZ2ImAbs, y >= 0.0)

    const z2_1Re = select(x, sqrtZ2Re, mode02)
    const z2_1Im = select(y, sqrtZ2Im, mode02)

    // z2.Dec() — always
    const z2_2Re = z2_1Re - 1.0
    const z2_2Im = z2_1Im

    // z2.Sqr() (conditional on mode02)
    const sqrZ2Re = z2_2Re * z2_2Re - z2_2Im * z2_2Im
    const sqrZ2Im = 2.0 * z2_2Re * z2_2Im

    const z2_3Re = select(z2_2Re, sqrZ2Re, mode02)
    const z2_3Im = select(z2_2Im, sqrZ2Im, mode02)

    // --- z.Div(z2) — always ---
    const denom = max(z2_3Re * z2_3Re + z2_3Im * z2_3Im, EPS.$)
    const divRe = (z3Re * z2_3Re + z3Im * z2_3Im) / denom
    const divIm = (z3Im * z2_3Re - z3Re * z2_3Im) / denom

    // --- sqrt(z) conditional on mode01 ---
    const rZ3 = sqrt(divRe * divRe + divIm * divIm)
    const sqrtZ3Re = sqrt(max((rZ3 + divRe) * 0.5, 0.0))
    const sqrtZ3ImAbs = sqrt(max((rZ3 - divRe) * 0.5, 0.0))
    const sqrtZ3Im = select(-sqrtZ3ImAbs, sqrtZ3ImAbs, divIm >= 0.0)

    const z4Re = select(divRe, sqrtZ3Re, mode01)
    const z4Im = select(divIm, sqrtZ3Im, mode01)

    // --- z.Div(z3) where z3 = reDiv + imDiv*i — always ---
    const denom3 = max(P.reDiv * P.reDiv + P.imDiv * P.imDiv, EPS.$)
    const finalRe = (z4Re * P.reDiv + z4Im * P.imDiv) / denom3
    const finalIm = (z4Im * P.reDiv - z4Re * P.imDiv) / denom3

    // --- Random sign flip for mode01 ---
    const sign = select(f32(-1.0), f32(1.0), random() < 0.5)
    const outRe = select(finalRe, sign * finalRe, mode01)
    const outIm = select(finalIm, sign * finalIm, mode01)

    return vec2f(pos.x + varInfo.weight * outRe, pos.y + varInfo.weight * outIm)
  },
  'general',
)
