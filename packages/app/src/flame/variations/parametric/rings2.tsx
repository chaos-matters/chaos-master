import { struct, f32, Infer } from 'typegpu/data'
import {
  EditorFor,
  editorProps,
} from '@/components/variationParamEditors/types'
import { parametricVariation } from '../types'
import { RangeEditor } from '@/components/variationParamEditors/RangeEditor'

export const Rings2Params = struct({
  val: f32,
})

export const Rings2ParamsEditor: EditorFor<Infer<typeof Rings2Params>> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'val', 'Value')}
      min={0}
      max={360}
      step={0.1}
    />
  </>
)

export const rings2 = parametricVariation(
  Rings2Params,
  Rings2ParamsEditor,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: RingsParams) -> vec2f {
    let p = P.val; 
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    let twop = 2 * p;
    let t = r - twop * trunc((r + p) / twop) + r * (1 - p);
    return t * vec2f(sin(theta), cos(theta));
  }`,
)
