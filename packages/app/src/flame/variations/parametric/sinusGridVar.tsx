import { f32, struct, vec2f } from 'typegpu/data'
import { cos } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SinusGridVarParams = struct({
  ampx: f32,
  ampy: f32,
  freqx: f32,
  freqy: f32,
})

type SinusGridVarParams = Infer<typeof SinusGridVarParams>

const SinusGridVarParamsDefaults: SinusGridVarParams = {
  ampx: 0.5,
  ampy: 0.6,
  freqx: 1.2,
  freqy: 1.0,
}

const SinusGridVarParamsEditor: EditorFor<SinusGridVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'ampx', 'Amp X')}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ampy', 'Amp Y')}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'freqx', 'Freq X')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'freqy', 'Freq Y')}
      min={0}
      max={5}
      step={0.01}
    />
  </>
)

export const sinusGridVar = parametricVariation(
  'sinusGridVar',
  SinusGridVarParams,
  SinusGridVarParamsDefaults,
  SinusGridVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'

    let _fx = P.freqx * (2.0 * PI.$)
    let _fy = P.freqy * (2.0 * PI.$)
    if (_fx === 0.0) _fx = EPS.$
    if (_fy === 0.0) _fy = EPS.$

    const sx = -1.0 * cos(pos.x * _fx)
    const sy = -1.0 * cos(pos.y * _fy)

    // lerp(a, b, p) = a + p * (b - a)
    const tx = pos.x + P.ampx * (sx - pos.x)
    const ty = pos.y + P.ampy * (sy - pos.y)

    return vec2f(tx, ty)
  },
)
