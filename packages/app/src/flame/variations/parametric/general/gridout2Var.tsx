import { f32, struct, vec2f } from 'typegpu/data'
import { round } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Gridout2VarParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
})

type Gridout2VarParams = Infer<typeof Gridout2VarParams>

const Gridout2VarParamsDefaults: Gridout2VarParams = {
  a: 1.0,
  b: 1.0,
  c: 1.0,
  d: 1.0,
}

const Gridout2VarParamsEditor: EditorFor<Gridout2VarParams> = (props) => (
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
      min={0.1}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D', props.dataParameterPath)}
      min={0.1}
      max={10}
      step={0.01}
    />
  </>
)

export const gridout2Var = parametricVariation(
  'gridout2Var',
  Gridout2VarParams,
  Gridout2VarParamsDefaults,
  Gridout2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = round(pos.x) * P.c
    const y = round(pos.y) * P.d

    if (y <= 0.0) {
      if (x > 0.0) {
        if (-y >= x) {
          return vec2f(pos.x + P.a, pos.y).mul(varInfo.weight)
        } else {
          return vec2f(pos.x, pos.y + P.b).mul(varInfo.weight)
        }
      } else {
        if (y <= x) {
          return vec2f(pos.x + P.a, pos.y).mul(varInfo.weight)
        } else {
          return vec2f(pos.x, pos.y - P.b).mul(varInfo.weight)
        }
      }
    } else {
      if (x > 0.0) {
        if (y >= x) {
          return vec2f(pos.x - P.a, pos.y).mul(varInfo.weight)
        } else {
          return vec2f(pos.x, pos.y + P.b).mul(varInfo.weight)
        }
      } else {
        if (y > -x) {
          return vec2f(pos.x - P.a, pos.y).mul(varInfo.weight)
        } else {
          return vec2f(pos.x, pos.y - P.b).mul(varInfo.weight)
        }
      }
    }
  },
  'general',
)
