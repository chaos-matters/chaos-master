import * as v from 'valibot'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { schemaToF32Struct } from '@/utils/schemaUtil'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { InferOutput } from 'valibot'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export const RectanglesParamsSchema = v.object({
  x: v.number(),
  y: v.number(),
})

export const RectanglesParams = schemaToF32Struct(
  RectanglesParamsSchema.entries,
)

const RectanglesParamsDefaults: InferOutput<typeof RectanglesParamsSchema> = {
  x: 2,
  y: 4,
}
export const RectanglesParamsEditor: EditorFor<
  Infer<typeof RectanglesParams>
> = (props) => (
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
  RectanglesParams,
  RectanglesParamsDefaults,
  RectanglesParamsEditor,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: RectanglesParams) -> vec2f {
    let p1 = P.x; 
    let p2 = P.y; 
    let p1Fact = (2 * floor(pos.x / p1) + 1);
    let p2Fact = (2 * floor(pos.y / p2) + 1);
    return vec2f(
        p1Fact * p1 - pos.x,
        p2Fact * p2 - pos.y,
      );
  }`,
)
