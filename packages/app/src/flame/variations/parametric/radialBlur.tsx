import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, length, sin } from 'typegpu/std'
import { AngleEditor } from '@/components/Sliders/ParametricEditors/AngleEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type RadialBlurParams = Infer<typeof RadialBlurParams>
const RadialBlurParams = struct({
  angle: f32,
})

const RadialBlurParamsDefaults: RadialBlurParams = {
  angle: Math.PI,
}

const RadialBlurEditor: EditorFor<Infer<typeof RadialBlurParams>> = (props) => (
  <AngleEditor {...editorProps(props, 'angle', 'Angle')} />
)

export const radialBlurVar = parametricVariation(
  'radialBlurVar',
  RadialBlurParams,
  RadialBlurParamsDefaults,
  RadialBlurEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const weight = varInfo.weight
    const p1 = P.angle
    const randSum = random() + random() + random() + random() - 2
    const r = length(pos)
    const t1 = weight * randSum
    const phi = atan2(pos.y, pos.x)
    const t2 = phi + t1 * sin(p1)
    const t3 = t1 * cos(p1) - 1
    return vec2f(r * cos(t2) + t3 * pos.x, r * sin(t2) + t3 * pos.y).div(weight)
  },
)
