import { AngleEditor } from '@/components/Sliders/ParametricEditors/AngleEditor'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { schemaToF32Struct } from '@/flame/valibot/schemaUtil'
import { PerspectiveParamsSchema } from '@/flame/valibot/variationSchema'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export const PerspectiveParams = schemaToF32Struct(
  PerspectiveParamsSchema.entries,
)
export const PerspectiveParamsEditor: EditorFor<
  Infer<typeof PerspectiveParams>
> = (props) => (
  <>
    <AngleEditor {...editorProps(props, 'angle', 'Angle')} />
    <RangeEditor
      {...editorProps(props, 'dist', 'Dist')}
      min={1}
      max={10}
      step={0.01}
    />
  </>
)

export const perspective = parametricVariation(
  PerspectiveParams,
  PerspectiveParamsEditor,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: PerspectiveParams) -> vec2f {
    let p1 = P.angle; 
    let p2 = P.dist; 
    let factor = p2 / (p2 - pos.y * sin(p1));
    return factor * vec2f(pos.x, pos.y * cos(p1));
  }`,
)
