import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type StripesParams = Infer<typeof StripesParams>
const StripesParams = struct({
  space: f32,
  warp: f32,
})

const StripesDefaults: StripesParams = {
  space: 0.2,
  warp: 0.6,
}

const StripesEditor: EditorFor<StripesParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'space', 'Space')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'warp', 'Warp')}
      min={-2}
      max={2}
      step={0.01}
    />
  </>
)

export const stripesVar = parametricVariation(
  'stripesVar',
  StripesParams,
  StripesDefaults,
  StripesEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const roundx = f32(floor(pos.x + 0.5))
    const offsetx = pos.x - roundx
    return vec2f(
      offsetx * (1.0 - P.space) + roundx,
      pos.y + offsetx * offsetx * P.warp,
    ).mul(varInfo.weight)
  },
  'general',
)
