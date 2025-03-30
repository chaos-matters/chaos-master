import { f32, struct } from 'typegpu/data'
import { RangeEditor } from '@/components/variationParamEditors/RangeEditor'
import { editorProps } from '@/components/variationParamEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/variationParamEditors/types'

export const JuliaNParams = struct({
  power: f32,
  dist: f32,
})

export const JuliaNParamsEditor: EditorFor<Infer<typeof JuliaNParams>> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={1}
      max={100}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'dist', 'Dist')}
      min={1}
      max={100}
      step={1}
    />
  </>
)

export const juliaN = parametricVariation(
  JuliaNParams,
  JuliaNParamsEditor,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: JuliaNParams) -> vec2f {
    let p1 = P.power; 
    let p2 = P.dist; 
    let p3 = trunc(abs(p1) * random()); 
    let r = length(pos);
    let phi = atan2(pos.y, pos.x);
    let t = (phi + 2 * PI * p3) / p1;
    let factor = pow(r, p2 / p1);
    return factor * vec2f(cos(t), sin(t));
  }`,
  { PI, random },
)
