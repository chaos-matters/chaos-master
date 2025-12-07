import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SpirographVarParams = struct({
  a: f32,
  b: f32,
  d: f32,
  tmin: f32,
  tmax: f32,
  ymin: f32,
  ymax: f32,
  c1: f32,
  c2: f32,
})

type SpirographVarParams = Infer<typeof SpirographVarParams>

const SpirographVarParamsDefaults: SpirographVarParams = {
  a: 3.0,
  b: 2.0,
  d: 0.0,
  tmin: -1.0,
  tmax: 1.0,
  ymin: -1.0,
  ymax: 1.0,
  c1: 0.0,
  c2: 0.0,
}

const SpirographVarParamsEditor: EditorFor<SpirographVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c1', 'C1')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c2', 'C2')}
      min={-5}
      max={5}
      step={0.01}
    />
    {/* Range limits for T and Y typically vary widely in fractal usage */}
    <RangeEditor
      {...editorProps(props, 'tmin', 'T Min')}
      min={-10}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'tmax', 'T Max')}
      min={-10}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'ymin', 'Y Min')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ymax', 'Y Max')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const spirographVar = parametricVariation(
  'spirographVar',
  SpirographVarParams,
  SpirographVarParamsDefaults,
  SpirographVarParamsEditor,
  (_pos, _varInfo, P) => {
    'use gpu'

    const t = (P.tmax - P.tmin) * random() + P.tmin
    const y = (P.ymax - P.ymin) * random() + P.ymin

    const x1 = (P.a + P.b) * cos(t) - P.c1 * cos(((P.a + P.b) / P.b) * t)
    const y1 = (P.a + P.b) * sin(t) - P.c2 * sin(((P.a + P.b) / P.b) * t)

    const newX = x1 + P.d * cos(t) + y
    const newY = y1 + P.d * sin(t) + y

    return vec2f(newX, newY)
  },
)
