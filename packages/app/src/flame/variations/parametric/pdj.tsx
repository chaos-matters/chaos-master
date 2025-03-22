import {
  EditorFor,
  editorProps,
} from '@/components/variationParamEditors/types'
import { parametricVariation } from '../types'
import { struct, f32, Infer } from 'typegpu/data'
import { RangeEditor } from '@/components/variationParamEditors/RangeEditor'

export const PdjParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
})

export const PdjParamsEditor: EditorFor<Infer<typeof PdjParams>> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'a', 'a')} min={0} max={100} step={1} />
    <RangeEditor {...editorProps(props, 'b', 'b')} min={0} max={100} step={1} />
    <RangeEditor {...editorProps(props, 'c', 'c')} min={0} max={100} step={1} />
    <RangeEditor {...editorProps(props, 'd', 'd')} min={0} max={100} step={1} />
  </>
)

export const pdjVar = parametricVariation(
  PdjParams,
  PdjParamsEditor,
  /* wgsl */ `(pos: vec2f, _varInfo: VariationInfo, P: PdjParams) -> vec2f {
    let p1 = P.a;
    let p2 = P.b;
    let p3 = P.c;
    let p4 = P.d;
    return vec2f(
      sin(p1 * pos.y) - cos(p2 * pos.x),
      sin(p3 * pos.x) - cos(p4 * pos.y)
    );
  }`,
)
