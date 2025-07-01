import { f32, struct } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type Fan2Params = Infer<typeof Fan2Params>
const Fan2Params = struct({
  x: f32,
  y: f32,
})

const Fan2ParamsDefaults: Fan2Params = {
  x: 1,
  y: 1,
}

const Fan2ParamsEditor: EditorFor<Fan2Params> = (props) => (
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
  'fan2',
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
