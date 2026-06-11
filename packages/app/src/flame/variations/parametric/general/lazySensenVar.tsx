import { f32, struct, vec2f } from 'typegpu/data'
import { floor, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const LazySensenVarParams = struct({
  scale_x: f32,
  scale_y: f32,
})

type LazySensenVarParams = Infer<typeof LazySensenVarParams>

const LazySensenVarParamsDefaults: LazySensenVarParams = {
  scale_x: 1.0,
  scale_y: 1.0,
}

const LazySensenVarParamsEditor: EditorFor<LazySensenVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scale_x', 'Scale X', props.dataParameterPath)}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scale_y', 'Scale Y', props.dataParameterPath)}
      min={0}
      max={10}
      step={0.01}
    />
  </>
)

export const lazySensenVar = parametricVariation(
  'lazySensenVar',
  LazySensenVarParams,
  LazySensenVarParamsDefaults,
  LazySensenVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const cellX = floor(pos.x * P.scale_x)
    const parityX = cellX - 2.0 * f32(floor(cellX * 0.5))
    const flipX = select(1.0 - parityX, parityX, cellX >= 0.0)

    const cellY = floor(pos.y * P.scale_y)
    const parityY = cellY - 2.0 * f32(floor(cellY * 0.5))
    const flipY = select(1.0 - parityY, parityY, cellY >= 0.0)

    return vec2f(
      select(pos.x, -pos.x, flipX > 0.5),
      select(pos.y, -pos.y, flipY > 0.5),
    ).mul(varInfo.weight)
  },
  'general',
)
