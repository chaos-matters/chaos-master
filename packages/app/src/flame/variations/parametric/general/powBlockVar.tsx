import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, floor, pow, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PowBlockVarParams = struct({
  numerator: f32,
  denominator: f32,
  root: f32,
  correctn: f32,
  correctd: f32,
})

type PowBlockVarParams = Infer<typeof PowBlockVarParams>

const PowBlockVarParamsDefaults: PowBlockVarParams = {
  numerator: 4.5,
  denominator: 2.5,
  root: 1.0,
  correctn: 1.0,
  correctd: 1.0,
}

const PowBlockVarParamsEditor: EditorFor<PowBlockVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'numerator', 'Numerator', props.dataParameterPath)}
      min={1}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(
        props,
        'denominator',
        'Denominator',
        props.dataParameterPath,
      )}
      min={1}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'root', 'Root', props.dataParameterPath)}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'correctn', 'Correct N', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'correctd', 'Correct D', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const powBlockVar = parametricVariation(
  'powBlockVar',
  PowBlockVarParams,
  PowBlockVarParamsDefaults,
  PowBlockVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const cdSafe = select(abs(P.correctd), EPS.$, abs(P.correctd) <= EPS.$)
    const denSafe = select(P.denominator, EPS.$, abs(P.denominator) <= EPS.$)
    const powerTmp = (P.denominator * P.correctn) / cdSafe
    const power =
      (P.numerator * 0.5) / select(powerTmp, EPS.$, abs(powerTmp) <= EPS.$)
    const deneps = 1.0 / denSafe
    const theta = atan2(pos.y, pos.x)
    const r2 = pow(pos.x * pos.x + pos.y * pos.y, power)
    const ran =
      (theta * deneps +
        P.root * 2.0 * PI.$ * f32(floor(random() * P.denominator)) * deneps) *
      P.numerator
    return vec2f(r2 * cos(ran), r2 * sin(ran)).mul(varInfo.weight)
  },
  'general',
)
