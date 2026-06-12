import { f32, struct, vec2f } from 'typegpu/data'
import { abs, sign, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const WallPaperVarParams = struct({
  a: f32,
  b: f32,
  c_: f32,
})

type WallPaperVarParams = Infer<typeof WallPaperVarParams>

const WallPaperVarParamsDefaults: WallPaperVarParams = {
  a: 1.156,
  b: -0.28,
  c_: 21.288,
}

const WallPaperVarParamsEditor: EditorFor<WallPaperVarParams> = (props) => (
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
      {...editorProps(props, 'c_', 'C', props.dataParameterPath)}
      min={0}
      max={50}
      step={0.01}
    />
  </>
)

export const wallPaperVar = parametricVariation(
  'wallPaperVar',
  WallPaperVarParams,
  WallPaperVarParamsDefaults,
  WallPaperVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    if (random() < 0.5) {
      return vec2f(
        pos.y - sign(pos.x) * sqrt(abs(P.b * pos.x - P.c_)),
        P.a - pos.x,
      ).mul(varInfo.weight)
    }
    return vec2f(pos.x, pos.y).mul(varInfo.weight)
  },
  'general',
)
