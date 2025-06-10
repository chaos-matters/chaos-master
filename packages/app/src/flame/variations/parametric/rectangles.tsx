import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { RectanglesParamsSchema } from '@/flame/valibot/index'
import { schemaToF32Struct } from '@/flame/valibot/schemaUtil'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export const RectanglesParams = schemaToF32Struct(
  RectanglesParamsSchema.entries,
)

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
