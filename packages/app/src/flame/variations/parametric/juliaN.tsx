import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, length, pow, sin, trunc } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type JuliaNParams = Infer<typeof JuliaNParams>
const JuliaNParams = struct({
  power: f32,
  dist: f32,
})

const JuliaNParamsDefaults: JuliaNParams = {
  power: 1,
  dist: 5,
}

const JuliaNParamsEditor: EditorFor<JuliaNParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={1}
      max={20}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'dist', 'Dist')}
      min={0}
      max={props.value.power + 1}
      step={0.01}
    />
  </>
)

export const juliaN = parametricVariation(
  'juliaN',
  JuliaNParams,
  JuliaNParamsDefaults,
  JuliaNParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const p1 = P.power
    const p2 = P.dist
    const p3 = trunc(abs(p1) * random())
    const r = length(pos)
    const phi = atan2(pos.y, pos.x)
    const t = (phi + 2 * PI.$ * p3) / p1
    const factor = pow(r, p2 / p1)
    return vec2f(cos(t), sin(t)).mul(factor)
  },
)
