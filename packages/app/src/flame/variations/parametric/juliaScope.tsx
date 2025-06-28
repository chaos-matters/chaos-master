import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { JuliaScopeParamsSchema } from '@/flame/valibot/index'
import { schemaToF32Struct } from '@/flame/valibot/schemaUtil'
import { parametricVariation } from '@/flame/variations/types'
import { random } from '@/shaders/random'
import type { Infer } from 'typegpu/data'
import type { InferOutput } from 'valibot'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const JuliaScopeParams = schemaToF32Struct(JuliaScopeParamsSchema.entries)

const JuliaScopeParamsDefaults: InferOutput<typeof JuliaScopeParamsSchema> = {
  power: 1,
  dist: 5,
}

export const JuliaScopeParamsEditor: EditorFor<
  Infer<typeof JuliaScopeParams>
> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={1}
      max={20}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'dist', 'Dist')}
      min={1}
      max={props.value.power + 1}
      step={0.01}
    />
  </>
)

export const juliaScope = parametricVariation(
  JuliaScopeParams,
  JuliaScopeParamsDefaults,
  JuliaScopeParamsEditor,
  /* wgsl */ `
  (pos: vec2f, _varInfo: VariationInfo, P: JuliaScopeParams) -> vec2f {
    let p1 = P.power; 
    let p2 = P.dist; 
    let p3 = trunc(abs(p1) * random()); 
    let r = length(pos);
    let phi = atan2(pos.y, pos.x);
    let lambda = select(-1.0, 1.0, random() > 0.5);
    let t = (lambda * phi + 2 * PI * p3) / p1;
    let factor = pow(r, p2 / p1);
    return factor * vec2f(cos(t), sin(t));
  }`,
  { PI, random },
)
