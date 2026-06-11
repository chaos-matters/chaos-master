import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Rational3VarParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  e: f32,
  f: f32,
  g: f32,
  h: f32,
})

type Rational3VarParams = Infer<typeof Rational3VarParams>

const Rational3VarParamsDefaults: Rational3VarParams = {
  a: 0.5,
  b: 0.0,
  c: 0.25,
  d: 1.0,
  e: 0.0,
  f: 0.9,
  g: 0.0,
  h: 1.0,
}

const Rational3VarParamsEditor: EditorFor<Rational3VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e', 'E', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f', 'F', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'g', 'G', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'h', 'H', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
  </>
)

export const rational3Var = parametricVariation(
  'rational3Var',
  Rational3VarParams,
  Rational3VarParamsDefaults,
  Rational3VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xsqr = pos.x * pos.x
    const ysqr = pos.y * pos.y
    const xcb = xsqr * pos.x
    const ycb = ysqr * pos.y
    const zt3 = xcb - 3.0 * pos.x * ysqr
    const zt2 = xsqr - ysqr
    const zb3 = 3.0 * xsqr * pos.y - ycb
    const zb2 = 2.0 * pos.x * pos.y

    const tr = P.a * zt3 + P.b * zt2 + P.c * pos.x + P.d
    const ti = P.a * zb3 + P.b * zb2 + P.c * pos.y

    const br = P.e * zt3 + P.f * zt2 + P.g * pos.x + P.h
    const bi = P.e * zb3 + P.f * zb2 + P.g * pos.y

    const r3den = 1.0 / (br * br + bi * bi)

    return vec2f((tr * br + ti * bi) * r3den, (ti * br - tr * bi) * r3den).mul(
      varInfo.weight,
    )
  },
  'general',
)
