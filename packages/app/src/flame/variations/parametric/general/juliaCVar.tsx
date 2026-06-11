import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, exp, floor, log, max, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const JuliaCVarParams = struct({
  re: f32,
  im: f32,
  dist: f32,
})

type JuliaCVarParams = Infer<typeof JuliaCVarParams>

const JuliaCVarParamsDefaults: JuliaCVarParams = {
  re: 3.0,
  im: 0.5,
  dist: 1.0,
}

const JuliaCVarParamsEditor: EditorFor<JuliaCVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 're', 'Re', props.dataParameterPath)}
      min={0.01}
      max={12.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'im', 'Im', props.dataParameterPath)}
      min={0.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'dist', 'Dist', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const juliaCVar = parametricVariation(
  'juliaCVar',
  JuliaCVarParams,
  JuliaCVarParamsDefaults,
  JuliaCVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const reInv = 1.0 / max(abs(P.re), EPS.$)
    const imScaled = P.im / 100.0

    const randInt = floor(random() * 65536.0)
    const absRe = max(abs(P.re), EPS.$)
    const angleOffset = (randInt - absRe * floor(randInt / absRe)) * 2.0 * PI.$

    const arg = atan2(pos.y, pos.x) + angleOffset
    const rSq = max(pos.x * pos.x + pos.y * pos.y, EPS.$)
    const lnmod = P.dist * 0.5 * log(rSq)

    const a = arg * reInv + lnmod * imScaled
    const s = sin(a)
    const c = cos(a)
    const mod2 = exp(lnmod * reInv - arg * imScaled)

    return vec2f(mod2 * c, mod2 * s).mul(varInfo.weight)
  },
  'general',
)
