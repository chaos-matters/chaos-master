import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { GridParamsSchema } from '@/flame/valibot/index'
import { schemaToF32Struct } from '@/flame/valibot/schemaUtil'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { InferOutput } from 'valibot'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const GridParams = schemaToF32Struct(GridParamsSchema.entries)

const GridParamsDefaults: InferOutput<typeof GridParamsSchema> = {
  divisions: 10.0,
  size: 1.0,
  jitterNearIntersectionsDistance: 0.002,
}

export const GridParamsEditor: EditorFor<Infer<typeof GridParams>> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'divisions', 'Divisions')}
      min={1}
      max={50}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'size', 'Size')}
      min={1}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(
        props,
        'jitterNearIntersectionsDistance',
        'Jitter near intersections',
      )}
      min={0}
      max={1}
      step={0.001}
    />
  </>
)

export const grid = parametricVariation(
  GridParams,
  GridParamsDefaults,
  GridParamsEditor,
  /* wgsl */ `
  (_pos: vec2f, _varInfo: VariationInfo, P: GridParams) -> vec2f {
    let D = P.jitterNearIntersectionsDistance;
    let divs = select(P.divisions, 1, random() > 0.8);
    let pos = P.size * (2 * vec2f(random(), random()) - 1);
    let jitter = 2 * D * (2 * vec2f(random(), random()) - 1);
    let rounded = round(divs * pos) / divs;
    let diff = abs(pos - rounded);
    let jittered = select(pos, pos + jitter, diff < vec2f(D));
    return select(
      vec2f(rounded.x, jittered.y),
      vec2f(jittered.x, rounded.y),
      random() > 0.5
    );
  }`,
  { random },
)
