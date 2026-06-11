import { f32, struct, vec2f } from 'typegpu/data'
import { floor, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Waves4VarParams = struct({
  scalex: f32,
  scaley: f32,
  freqx: f32,
  freqy: f32,
  cont: f32,
  yfact: f32,
})

type Waves4VarParams = Infer<typeof Waves4VarParams>

const Waves4VarParamsDefaults: Waves4VarParams = {
  scalex: 0.05,
  scaley: 0.05,
  freqx: 7.0,
  freqy: 13.0,
  cont: 0.0,
  yfact: 0.1,
}

const Waves4VarParamsEditor: EditorFor<Waves4VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scalex', 'Scale X', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scaley', 'Scale Y', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'freqx', 'Freq X', props.dataParameterPath)}
      min={0}
      max={20}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'freqy', 'Freq Y', props.dataParameterPath)}
      min={0}
      max={20}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'cont', 'Continuous', props.dataParameterPath)}
      min={0}
      max={1}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'yfact', 'Y Factor', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const waves4Var = parametricVariation(
  'waves4Var',
  Waves4VarParams,
  Waves4VarParamsDefaults,
  Waves4VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x0 = pos.x
    const y0 = pos.y

    let ax = f32(floor((y0 * P.freqx) / (2.0 * PI.$)))
    ax =
      sin(ax * 12.9898 + ax * 78.233 + 1.0 + y0 * 0.001 * P.yfact) * 43758.5453
    ax = ax - floor(ax)
    if (P.cont > 0.5) {
      ax = select(f32(0.0), f32(1.0), ax > 0.5)
    }

    return vec2f(
      x0 + sin(y0 * P.freqx) * ax * ax * P.scalex,
      y0 + sin(x0 * P.freqy) * P.scaley,
    ).mul(varInfo.weight)
  },
  'general',
)
