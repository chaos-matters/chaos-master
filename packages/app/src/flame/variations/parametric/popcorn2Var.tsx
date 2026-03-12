import { f32, struct, vec2f } from 'typegpu/data'
import { sin, tan } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Popcorn2VarParams = struct({
  x: f32,
  y: f32,
  c: f32,
})

type Popcorn2VarParams = Infer<typeof Popcorn2VarParams>

const Popcorn2VarParamsDefaults: Popcorn2VarParams = {
  x: 1.0,
  y: 0.5,
  c: 1.5,
}

const Popcorn2VarParamsEditor: EditorFor<Popcorn2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'X')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const popcorn2Var = parametricVariation(
  'popcorn2Var',
  Popcorn2VarParams,
  Popcorn2VarParamsDefaults,
  Popcorn2VarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const newX = pos.x + P.x * sin(tan(pos.y * P.c))
    const newY = pos.y + P.y * sin(tan(pos.x * P.c))

    return vec2f(newX, newY)
  },
)
