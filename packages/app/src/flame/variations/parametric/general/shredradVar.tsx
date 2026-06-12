import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, floor, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ShredradVarParams = struct({
  n: f32,
  width: f32,
})

type ShredradVarParams = Infer<typeof ShredradVarParams>

const ShredradVarParamsDefaults: ShredradVarParams = {
  n: 4.0,
  width: 0.5,
}

const ShredradVarParamsEditor: EditorFor<ShredradVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'n', 'N', props.dataParameterPath)}
      min={1}
      max={20}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'width', 'Width', props.dataParameterPath)}
      min={-1}
      max={1}
      step={0.01}
    />
  </>
)

export const shredradVar = parametricVariation(
  'shredradVar',
  ShredradVarParams,
  ShredradVarParamsDefaults,
  ShredradVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const nSafe = select(P.n, EPS.$, P.n <= EPS.$)
    const sa = (2.0 * PI.$) / nSafe
    const sw = 1.0 - abs(P.width)
    const ang = atan2(pos.y, pos.x)
    const rad = sqrt(pos.x * pos.x + pos.y * pos.y)
    const xang = (ang + 3.0 * PI.$ + sa / 2.0) / sa
    const fxang = floor(xang)
    const zang = (xang - fxang) * sw * sa + fxang * sa - PI.$ - (sa / 2.0) * sw
    return vec2f(rad * cos(zang), rad * sin(zang)).mul(varInfo.weight)
  },
  'general',
)
