import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PdjParamsSchema } from '@/flame/valibot/index'
import { schemaToF32Struct } from '@/flame/valibot/schemaUtil'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { InferOutput } from 'valibot'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export const PdjParams = schemaToF32Struct(PdjParamsSchema.entries)

const PdjParamsDefaults: InferOutput<typeof PdjParamsSchema> = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
}

export const PdjParamsEditor: EditorFor<Infer<typeof PdjParams>> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'a')}
      min={1}
      max={15}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'b')}
      min={1}
      max={15}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'c')}
      min={1}
      max={15}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'd')}
      min={1}
      max={15}
      step={0.1}
    />
  </>
)

export const pdjVar = parametricVariation(
  PdjParams,
  PdjParamsDefaults,
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
