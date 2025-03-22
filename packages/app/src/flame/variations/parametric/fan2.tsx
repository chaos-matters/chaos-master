import { f32, Infer, struct } from 'typegpu/data'
import { parametricVariation } from '../types'
import { PI } from '@/flame/constants'
import {
  EditorFor,
  editorProps,
} from '@/components/variationParamEditors/types'
import { RangeEditor } from '@/components/variationParamEditors/RangeEditor'

const Fan2Params = struct({
  x: f32,
  y: f32,
})

export const Fan2ParamsEditor: EditorFor<Infer<typeof Fan2Params>> = (
  props,
) => (
  <>
    <RangeEditor {...editorProps(props, 'x', 'X')} min={1} max={100} step={1} />
    <RangeEditor {...editorProps(props, 'y', 'Y')} min={1} max={100} step={1} />
  </>
)

export const fan2 = parametricVariation(
  Fan2Params,
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
