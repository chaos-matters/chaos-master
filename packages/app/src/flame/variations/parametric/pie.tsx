import * as v from 'valibot'
import { AngleEditor } from '@/components/Sliders/ParametricEditors/AngleEditor'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { schemaToF32Struct } from '@/utils/schemaUtil'
import { PI } from '../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { InferOutput } from 'valibot'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export const PieParamsSchema = v.object({
  slices: v.number(),
  rotation: v.number(),
  thickness: v.number(),
})

export const PieParams = schemaToF32Struct(PieParamsSchema.entries)

const PieParamsDefaults: InferOutput<typeof PieParamsSchema> = {
  slices: 6,
  rotation: Math.PI,
  thickness: 0.5,
}

export const PieParamsEditor: EditorFor<Infer<typeof PieParams>> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'slices', 'Slices')}
      min={1}
      max={200}
      step={1}
    />
    <AngleEditor {...editorProps(props, 'rotation', 'Rotation')} />
    <RangeEditor
      {...editorProps(props, 'thickness', 'Thickness')}
      min={0}
      max={2 * Math.PI}
      step={0.01}
    />
  </>
)

export const pie = parametricVariation(
  PieParams,
  PieParamsDefaults,
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
