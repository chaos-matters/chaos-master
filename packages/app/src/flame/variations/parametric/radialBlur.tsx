import * as v from 'valibot'
import { AngleEditor } from '@/components/Sliders/ParametricEditors/AngleEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { schemaToF32Struct } from '@/utils/schemaUtil'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { InferOutput } from 'valibot'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export const RadialBlurParamsSchema = v.object({
  angle: v.number(),
})
export const RadialBlurParams = schemaToF32Struct(
  RadialBlurParamsSchema.entries,
)

const RadialBlurParamsDefaults: InferOutput<typeof RadialBlurParamsSchema> = {
  angle: Math.PI,
}

export const RadialBlurEditor: EditorFor<Infer<typeof RadialBlurParams>> = (
  props,
) => (
  <>
    <AngleEditor {...editorProps(props, 'angle', 'Angle')} />
  </>
)

export const radialBlurVar = parametricVariation(
  RadialBlurParams,
  RadialBlurParamsDefaults,
  RadialBlurEditor,
  /* wgsl */ `
  (pos: vec2f, varInfo: VariationInfo, P: RadialBlurParams) -> vec2f {
    let weight = varInfo.weight;
    let p1 = P.angle; 
    let randSum = random() + random() + random() + random() - 2;
    let r = length(pos); 
    let t1 = weight * randSum; 
    let phi = atan2(pos.y, pos.x);
    let t2 = phi + t1 * sin(p1); 
    let t3 = t1 * cos(p1) - 1;
    return 1/weight * vec2f(
        r * cos(t2) + t3 * pos.x,
        r * sin(t2) + t3 * pos.y
    );
  }`,
  { random },
)
