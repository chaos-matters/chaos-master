import { f32, struct, vec2f } from 'typegpu/data'
import { cos, mix, sin, step } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const YinYangVarParams = struct({
  radius: f32,
  ang1: f32,
  ang2: f32,
  dual_t: f32,
  outside: f32,
})

type YinYangVarParams = Infer<typeof YinYangVarParams>

const YinYangVarParamsDefaults: YinYangVarParams = {
  radius: 0.5,
  ang1: 0.0,
  ang2: 0.0,
  dual_t: 1,
  outside: 0,
}

const YinYangVarParamsEditor: EditorFor<YinYangVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius', props.dataParameterPath)}
      min={0.01}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ang1', 'Angle 1', props.dataParameterPath)}
      min={-PI.$}
      max={PI.$}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ang2', 'Angle 2', props.dataParameterPath)}
      min={-PI.$}
      max={PI.$}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'dual_t', 'Dual T', props.dataParameterPath)}
      min={0}
      max={2}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'outside', 'Outside', props.dataParameterPath)}
      min={0}
      max={1}
      step={1}
    />
  </>
)

export const yinYangVar = parametricVariation(
  'yinYangVar',
  YinYangVarParams,
  YinYangVarParamsDefaults,
  YinYangVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const a = PI.$
    const ang1 = a * P.ang1
    const ang2 = a * P.ang2
    const s = sin(ang1)
    const c = cos(ang1)

    const u = x * c + y * s
    const v = x * s - y * c

    const r2 = u * u + v * v

    let t = (2.0 * P.radius * (v + P.radius)) / (r2 + 0.000001)
    t = t * P.dual_t
    t = mix(t, -t, step(P.outside, 0.5))

    const nt = ang2
    const cs = cos(t + nt)
    const sn = sin(t + nt)

    const nx = u * cs - v * sn
    const ny = u * sn + v * cs

    return vec2f(nx * varInfo.weight, ny * varInfo.weight)
  },
  'general',
)
