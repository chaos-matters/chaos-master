import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { BlobParamsSchema } from '@/flame/valibot/index'
import { schemaToF32Struct } from '@/flame/valibot/schemaUtil'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { InferOutput } from 'valibot'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BlobParams = schemaToF32Struct(BlobParamsSchema.entries)

const BlobParamsDefaults: InferOutput<typeof BlobParamsSchema> = {
  high: 2,
  low: 1,
  waves: 1,
}

export const BlobParamsEditor: EditorFor<Infer<typeof BlobParams>> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'low', 'Low')}
      min={0}
      max={props.value.high}
    />
    <RangeEditor
      {...editorProps(props, 'high', 'High')}
      min={props.value.low}
      max={20}
    />
    <RangeEditor
      {...editorProps(props, 'waves', 'Waves')}
      min={-50}
      max={50}
      step={1}
    />
  </>
)

export const blob = parametricVariation(
  BlobParams,
  BlobParamsDefaults,
  BlobParamsEditor,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: BlobParams) -> vec2f {
    let p1 = P.high;
    let p2 = P.low;
    let p3 = P.waves;
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let sinWavesTheta = sin(p3 * theta);
    let sinFactor = (p1 - p2) / 2;
    let blobFact = r * (p2 + sinFactor * (sinWavesTheta + 1));
    return blobFact * vec2f(cos(theta), sin(theta));
  }`,
)
