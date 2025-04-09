import { f32, struct } from 'typegpu/data'
import { RangeEditor } from '@/components/variationParamEditors/RangeEditor'
import { editorProps } from '@/components/variationParamEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/variationParamEditors/types'

export const PerspectiveParams = struct({
  angle: f32,
  dist: f32,
})

export const PerspectiveParamsDefaults: Infer<typeof PerspectiveParams> = {
  angle: Math.PI,
  dist: 3,
}

export const PerspectiveParamsEditor: EditorFor<
  Infer<typeof PerspectiveParams>
> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle')}
      min={0}
      max={Math.PI}
      step={0.01}
    />
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
  PerspectiveParamsDefaults,
  PerspectiveParamsEditor,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: PerspectiveParams) -> vec2f {
    let p1 = P.angle; 
    let p2 = P.dist; 
    let factor = p2 / (p2 - pos.y * sin(p1));
    return factor * vec2f(pos.x, pos.y * cos(p1));
  }`,
)
