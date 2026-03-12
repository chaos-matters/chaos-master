import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, length, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type CircusParams = Infer<typeof CircusParams>
const CircusParams = struct({
  scale: f32,
})

const CircusParamsDefaults: CircusParams = {
  scale: 0.92,
}

const CircusParamsEditor: EditorFor<CircusParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0.01}
      max={5}
      step={0.01}
    />
  </>
)

export const circus = parametricVariation(
  'circus',
  CircusParams,
  CircusParamsDefaults,
  CircusParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    let r = length(pos)
    const theta = atan2(pos.y, pos.x)
    const s = sin(theta)
    const c = cos(theta)

    const scale1 = 1.0 / P.scale
    r = r * select(scale1, P.scale, r <= 1.0)
    return vec2f(r * c, r * s)
  },
)
