import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, pow, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SuperShapeVarParams = struct({
  rnd: f32,
  m: f32,
  n1: f32,
  n2: f32,
  n3: f32,
  holes: f32,
})

type SuperShapeVarParams = Infer<typeof SuperShapeVarParams>

const SuperShapeVarParamsDefaults: SuperShapeVarParams = {
  rnd: 3.0,
  m: 1.0,
  n1: 1.0,
  n2: 1.0,
  n3: 1.0,
  holes: 0.0,
}

const SuperShapeVarParamsEditor: EditorFor<SuperShapeVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'rnd', 'Rnd', props.dataParameterPath)}
      min={0.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'm', 'M', props.dataParameterPath)}
      min={0.1}
      max={20.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'n1', 'N1', props.dataParameterPath)}
      min={0.1}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'n2', 'N2', props.dataParameterPath)}
      min={0.1}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'n3', 'N3', props.dataParameterPath)}
      min={0.1}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'holes', 'Holes', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
  </>
)

export const superShapeVar = parametricVariation(
  'superShapeVar',
  SuperShapeVarParams,
  SuperShapeVarParamsDefaults,
  SuperShapeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const pm4 = P.m / 4.0
    const pneg1n1 = -1.0 / P.n1
    const theta = pm4 * atan2(pos.y, pos.x) + PI.$ / 4.0
    const t1 = pow(abs(cos(theta)), P.n2)
    const t2 = pow(abs(sin(theta)), P.n3)
    const pr = sqrt(pos.x * pos.x + pos.y * pos.y)
    const myrnd = P.rnd
    const rBase = myrnd * random() + (1.0 - myrnd) * pr - P.holes
    const rShape = pow(t1 + t2, pneg1n1)
    const factor = (rBase * rShape) / pr
    return vec2f(factor * pos.x, factor * pos.y).mul(varInfo.weight)
  },
  'general',
)
