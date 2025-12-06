import { f32, struct, vec2f } from 'typegpu/data'
import { sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const LissajousVarParams = struct({
  tmin: f32,
  tmax: f32,
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  e: f32,
})

type LissajousVarParams = Infer<typeof LissajousVarParams>

const LissajousVarParamsDefaults: LissajousVarParams = {
  tmin: -PI.$,
  tmax: PI.$,
  a: 3.0,
  b: 2.0,
  c: 0.0,
  d: 0.0,
  e: 0.0,
}

const LissajousVarParamsEditor: EditorFor<LissajousVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'tmin', 'T Min')}
      min={-10}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'tmax', 'T Max')}
      min={-10}
      max={10}
      step={0.01}
    />
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
      {...editorProps(props, 'c', 'C')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D')}
      min={-PI.$}
      max={PI.$}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e', 'E')}
      min={-1}
      max={1}
      step={0.01}
    />
  </>
)

export const lissajousVar = parametricVariation(
  'lissajousVar',
  LissajousVarParams,
  LissajousVarParamsDefaults,
  LissajousVarParamsEditor,
  (_pos, _varInfo, P) => {
    'use gpu'

    const t = (P.tmax - P.tmin) * random() + P.tmin
    const y = random() - 0.5
    const x1 = sin(P.a * t + P.d)
    const y1 = sin(P.b * t)

    const newX = x1 + P.c * t + P.e * y
    const newY = y1 + P.c * t + P.e * y

    return vec2f(newX, newY)
  },
)
