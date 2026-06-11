import { f32, struct, vec2f } from 'typegpu/data'
import { exp, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const HarmonographVarParams = struct({
  time: f32,
  a1: f32,
  f1: f32,
  p1: f32,
  d1: f32,
  a2: f32,
  f2: f32,
  p2: f32,
  d2: f32,
  a3: f32,
  f3: f32,
  p3: f32,
  d3: f32,
  a4: f32,
  f4: f32,
  p4: f32,
  d4: f32,
})

type HarmonographVarParams = Infer<typeof HarmonographVarParams>

const HarmonographVarParamsDefaults: HarmonographVarParams = {
  time: 100.0,
  a1: 1.0,
  f1: 1.0,
  p1: 0.0,
  d1: 0.0,
  a2: 1.0,
  f2: 2.0,
  p2: 0.0,
  d2: 0.0,
  a3: 1.0,
  f3: 1.0,
  p3: 90.0,
  d3: 0.0,
  a4: 1.0,
  f4: 3.0,
  p4: 90.0,
  d4: 0.0,
}

const HarmonographVarParamsEditor: EditorFor<HarmonographVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'time', 'Time')}
      min={1}
      max={500}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'a1', 'Amp X1')}
      min={0}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f1', 'Freq X1')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'p1', 'Phase X1')}
      min={0}
      max={360}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'd1', 'Damp X1')}
      min={0}
      max={0.1}
      step={0.001}
    />
    <RangeEditor
      {...editorProps(props, 'a2', 'Amp X2')}
      min={0}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f2', 'Freq X2')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'p2', 'Phase X2')}
      min={0}
      max={360}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'd2', 'Damp X2')}
      min={0}
      max={0.1}
      step={0.001}
    />
    <RangeEditor
      {...editorProps(props, 'a3', 'Amp Y1')}
      min={0}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f3', 'Freq Y1')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'p3', 'Phase Y1')}
      min={0}
      max={360}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'd3', 'Damp Y1')}
      min={0}
      max={0.1}
      step={0.001}
    />
    <RangeEditor
      {...editorProps(props, 'a4', 'Amp Y2')}
      min={0}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f4', 'Freq Y2')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'p4', 'Phase Y2')}
      min={0}
      max={360}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'd4', 'Damp Y2')}
      min={0}
      max={0.1}
      step={0.001}
    />
  </>
)

const degToRad = (d: number) => {
  'use gpu'
  return (d * PI.$) / 180.0
}

export const harmonographVar = parametricVariation(
  'harmonographVar',
  HarmonographVarParams,
  HarmonographVarParamsDefaults,
  HarmonographVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const t = random() * P.time
    const x =
      P.a1 * sin(t * P.f1 + degToRad(P.p1)) * exp(-P.d1 * t) +
      P.a2 * sin(t * P.f2 + degToRad(P.p2)) * exp(-P.d2 * t)
    const y =
      P.a3 * sin(t * P.f3 + degToRad(P.p3)) * exp(-P.d3 * t) +
      P.a4 * sin(t * P.f4 + degToRad(P.p4)) * exp(-P.d4 * t)
    return vec2f(pos.x + x * 0.005, pos.y + y * 0.005).mul(varInfo.weight)
  },
  'general',
)
