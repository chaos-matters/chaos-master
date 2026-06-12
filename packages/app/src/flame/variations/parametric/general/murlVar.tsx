import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, pow, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const MurlVarParams = struct({
  c: f32,
  power: f32,
})

type MurlVarParams = Infer<typeof MurlVarParams>

const MurlVarParamsDefaults: MurlVarParams = {
  c: 0.1,
  power: 1.0,
}

const MurlVarParamsEditor: EditorFor<MurlVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'c', 'C', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'power', 'Power', props.dataParameterPath)}
      min={1}
      max={20}
      step={1}
    />
  </>
)

export const murlVar = parametricVariation(
  'murlVar',
  MurlVarParams,
  MurlVarParamsDefaults,
  MurlVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const n = P.power
    const cUse = P.c / select(n - 1.0, 1.0, n === 1.0)
    const p2 = n / 2.0
    const vp = cUse + 1.0
    const a = atan2(pos.y, pos.x) * n
    const sina = sin(a)
    const cosa = cos(a)
    const r = cUse * pow(pos.x * pos.x + pos.y * pos.y, p2)
    const re = r * cosa + 1.0
    const im = r * sina
    const rl = vp / (re * re + im * im)
    return vec2f(
      rl * (pos.x * re + pos.y * im),
      rl * (pos.y * re - pos.x * im),
    ).mul(varInfo.weight)
  },
  'general',
)
