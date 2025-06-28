import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { Fan2ParamsSchema } from '@/flame/valibot/index'
import { schemaToF32Struct } from '@/flame/valibot/schemaUtil'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { InferOutput } from 'valibot'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Fan2Params = schemaToF32Struct(Fan2ParamsSchema.entries)

const Fan2ParamsDefaults: InferOutput<typeof Fan2ParamsSchema> = {
  x: 1,
  y: 1,
}

export const Fan2ParamsEditor: EditorFor<Infer<typeof Fan2Params>> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'X')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y')}
      min={0}
      max={1}
      step={0.01}
    />
  </>
)

export const fan2 = parametricVariation(
  Fan2Params,
  Fan2ParamsDefaults,
  Fan2ParamsEditor,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: FanParams) -> vec2f {
    let p1 = PI * P.x * P.x;
    let p2 = P.y; 
    let theta = atan2(pos.y, pos.x);
    let t = theta + p2 - p1 * trunc((2 * theta * p2) / p1); 
    let r = length(pos); 

    let p1half = p1 / 2;
    let trueAngle = theta - p1half;
    let falseAngle = theta + p1half;
    let angle = select(falseAngle, trueAngle, t > p1half);
    return r * vec2f(sin(angle), cos(angle));
  }`,
  { PI },
)
