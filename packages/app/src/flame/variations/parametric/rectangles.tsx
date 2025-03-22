import { struct, f32, Infer } from 'typegpu/data'
import {
  EditorFor,
  editorProps,
} from '@/components/variationParamEditors/types'
import { parametricVariation } from '../types'
import { RangeEditor } from '@/components/variationParamEditors/RangeEditor'

export const RectanglesParams = struct({
  x: f32,
  y: f32,
})

export const RectanglesParamsEditor: EditorFor<
  Infer<typeof RectanglesParams>
> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'x')}
      min={0}
      max={125}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'y')}
      min={0}
      max={125}
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
