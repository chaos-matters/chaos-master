import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { CurlParamsSchema } from '@/flame/valibot/index'
import { schemaToF32Struct } from '@/flame/valibot/schemaUtil'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { InferOutput } from 'valibot'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CurlParams = schemaToF32Struct(CurlParamsSchema.entries)

const CurlParamsDefaults: InferOutput<typeof CurlParamsSchema> = {
  c1: 1,
  c2: 1,
}
export const CurlParamsEditor: EditorFor<Infer<typeof CurlParams>> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'c1', 'C1')}
      min={0}
      max={5}
      step={0.001}
    />
    <RangeEditor
      {...editorProps(props, 'c2', 'C2')}
      min={0}
      max={50}
      step={1}
    />
  </>
)

export const curlVar = parametricVariation(
  CurlParams,
  CurlParamsDefaults,
  CurlParamsEditor,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: CurlParams) -> vec2f {
    let p1 = P.c1; 
    let p2 = P.c2; 
    let squareDiff = (pos.x * pos.x - pos.y * pos.y);
    let t1 = 1 + p1 * pos.x + p2 * squareDiff; 
    let t2 = p1 * pos.y + 2 * p2 * pos.x * pos.y;
    let tSqSum = t1 * t1 + t2 * t2;
    let factor = 1 / (tSqSum);
    return factor * vec2f(
        pos.x * t1 + pos.y * t2,
        pos.y * t1 - pos.x * t2
      );
  }`,
)
