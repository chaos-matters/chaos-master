import { f32, struct, vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CropBoxParams = struct({
  left: f32,
  right: f32,
  top: f32,
  bottom: f32,
  zero: f32,
})
type CropBoxParams = Infer<typeof CropBoxParams>
const CropBoxParamsDefaults: CropBoxParams = {
  left: -0.5,
  right: 0.5,
  top: -0.5,
  bottom: 0.5,
  zero: 0,
}
const CropBoxParamsEditor: EditorFor<CropBoxParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'left', 'Left')} min={-2} max={2} />
    <RangeEditor {...editorProps(props, 'right', 'Right')} min={-2} max={2} />
    <RangeEditor {...editorProps(props, 'top', 'Top')} min={-2} max={2} />
    <RangeEditor {...editorProps(props, 'bottom', 'Bottom')} min={-2} max={2} />
    <RangeEditor
      {...editorProps(props, 'zero', 'Zero')}
      min={0}
      max={1}
      step={1}
    />
  </>
)

export const cropBoxVar = parametricVariation(
  'cropBoxVar',
  CropBoxParams,
  CropBoxParamsDefaults,
  CropBoxParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const l = f32(select(P.left, P.right, P.left < P.right))
    const r = f32(select(P.left, P.right, P.left > P.right))
    const t = f32(select(P.bottom, P.top, P.top < P.bottom))
    const b = f32(select(P.bottom, P.top, P.top > P.bottom))

    const outside = pos.x < l || pos.x > r || pos.y < t || pos.y > b
    if (outside) {
      if (P.zero > 0.5) {
        return vec2f(0.0, 0.0).mul(varInfo.weight)
      }
      const w = (r - l) * 0.5
      const h = (b - t) * 0.5
      let x = pos.x
      let y = pos.y
      if (x < l) x = l + random() * w
      if (x > r) x = r - random() * w
      if (y < t) y = t + random() * h
      if (y > b) y = b - random() * h
      return vec2f(x, y).mul(varInfo.weight)
    }
    return vec2f(pos.x, pos.y).mul(varInfo.weight)
  },
  'crop',
)
