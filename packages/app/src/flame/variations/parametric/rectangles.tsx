import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type RectanglesParams = Infer<typeof RectanglesParams>
const RectanglesParams = struct({
  x: f32,
  y: f32,
})

const RectanglesParamsDefaults: RectanglesParams = {
  x: 2,
  y: 4,
}

const RectanglesParamsEditor: EditorFor<RectanglesParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'x')}
      min={1}
      max={20}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'y')}
      min={1}
      max={20}
      step={0.1}
    />
  </>
)

export const rectanglesVar = parametricVariation(
  'rectanglesVar',
  RectanglesParams,
  RectanglesParamsDefaults,
  RectanglesParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const p1 = P.x
    const p2 = P.y
    const p1Fact = 2 * floor(pos.x / p1) + 1
    const p2Fact = 2 * floor(pos.y / p2) + 1
    return vec2f(p1Fact * p1 - pos.x, p2Fact * p2 - pos.y)
  },
)
