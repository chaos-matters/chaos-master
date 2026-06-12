import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Disc3VarParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  e: f32,
  f: f32,
  g: f32,
  h: f32,
})

type Disc3VarParams = Infer<typeof Disc3VarParams>

const Disc3VarParamsDefaults: Disc3VarParams = {
  a: 1.0,
  b: 1.0,
  c: 1.0,
  d: 1.0,
  e: 1.0,
  f: 1.0,
  g: 1.0,
  h: 1.0,
}

const Disc3VarParamsEditor: EditorFor<Disc3VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e', 'E', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f', 'F', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'g', 'G', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'h', 'H', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const disc3Var = parametricVariation(
  'disc3Var',
  Disc3VarParams,
  Disc3VarParamsDefaults,
  Disc3VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const rPI =
      PI.$ * sqrt(pos.x * P.d * pos.x * P.e + pos.y * P.f * pos.y * P.g)
    const sinr = sin(rPI) * P.a
    const cosr = cos(rPI) * P.b
    const r = (atan2(pos.y, pos.x) / PI.$) * P.c
    return vec2f(sinr * P.h * r, cosr * P.h * r).mul(varInfo.weight)
  },
  'general',
)
