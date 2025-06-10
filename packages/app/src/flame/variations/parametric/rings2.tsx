import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { schemaToF32Struct } from '@/flame/valibot/schemaUtil'
import { Rings2ParamsSchema } from '@/flame/valibot/variationSchema'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export const Rings2Params = schemaToF32Struct(Rings2ParamsSchema.entries)

export const Rings2ParamsEditor: EditorFor<Infer<typeof Rings2Params>> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'val', 'Value')}
      min={1}
      max={20}
      step={0.01}
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
