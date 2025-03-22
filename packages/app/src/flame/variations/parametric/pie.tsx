import { struct, f32, Infer } from 'typegpu/data'
import { PI } from '../../constants'
import { random } from '@/shaders/random'
import {
  EditorFor,
  editorProps,
} from '@/components/variationParamEditors/types'
import { parametricVariation } from '../types'
import { RangeEditor } from '@/components/variationParamEditors/RangeEditor'

export const PieParams = struct({
  slices: f32,
  rotation: f32,
  thickness: f32,
})

export const PieParamsEditor: EditorFor<Infer<typeof PieParams>> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'slices', 'Slices')}
      min={0}
      max={50}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'rotation', 'Rotation')}
      min={0}
      max={360}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'thickness', 'Thickness')}
      min={0}
      max={100}
      step={1}
    />
  </>
)

export const pie = parametricVariation(
  PieParams,
  PieParamsEditor,
  /* wgsl */ `(_pos: vec2f, _varInfo: VariationInfo, P: PieParams) -> vec2f {
    let p1 = P.slices;
    let p2 = P.rotation;
    let p3 = P.thickness;
    let r1 = random();
    let r2 = random();
    let r3 = random();
    let t1 = trunc(r1 * p1 + 0.5);
    let t2 = p2 + (t1 + r2 * p3) * 2 * PI / p1;
    return r3 * vec2f(cos(t2), sin(t2));
  }`,
  { random, PI },
)
