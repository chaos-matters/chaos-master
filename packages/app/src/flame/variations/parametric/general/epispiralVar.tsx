import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const EpispiralVarParams = struct({
  n: f32,
  thickness: f32,
  holes: f32,
})

type EpispiralVarParams = Infer<typeof EpispiralVarParams>

const EpispiralVarParamsDefaults: EpispiralVarParams = {
  n: 6.0,
  thickness: 0.0,
  holes: 1.0,
}

const EpispiralVarParamsEditor: EditorFor<EpispiralVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'n', 'N', props.dataParameterPath)}
      min={1.0}
      max={20.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'thickness', 'Thickness', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
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

export const epispiralVar = parametricVariation(
  'epispiralVar',
  EpispiralVarParams,
  EpispiralVarParamsDefaults,
  EpispiralVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const theta = atan2(pos.y, pos.x)
    const d = cos(P.n * theta)
    if (d === 0.0) {
      return vec2f(0.0, 0.0).mul(varInfo.weight)
    }
    let t = -P.holes
    if (abs(P.thickness) > EPS.$) {
      t += random() * P.thickness * (1.0 / d)
    } else {
      t += 1.0 / d
    }
    return vec2f(t * cos(theta), t * sin(theta)).mul(varInfo.weight)
  },
  'general',
)
