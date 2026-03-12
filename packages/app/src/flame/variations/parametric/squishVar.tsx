import { f32, struct, vec2f } from 'typegpu/data'
import { abs, floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SquishVarParams = struct({
  power: f32,
})

type SquishVarParams = Infer<typeof SquishVarParams>

const SquishVarParamsDefaults: SquishVarParams = {
  power: 2,
}

const SquishVarParamsEditor: EditorFor<SquishVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={2}
      max={20}
      step={1}
    />
  </>
)

export const squishVar = parametricVariation(
  'squishVar',
  SquishVarParams,
  SquishVarParamsDefaults,
  SquishVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'

    const x = abs(pos.x)
    const y = abs(pos.y)
    let s = f32(0.0)
    let p = f32(0.0)

    if (x > y) {
      s = x
      if (pos.x > 0.0) {
        p = pos.y
      } else {
        p = 4.0 * s - pos.y
      }
    } else {
      s = y
      if (pos.y > 0.0) {
        p = 2.0 * s - pos.x
      } else {
        p = 6.0 * s + pos.x
      }
    }

    const _inv_power = 1.0 / P.power
    // Note: random() generates a float 0..1.
    // Java: floor(power * pContext.random())
    const randVal = random()
    p = _inv_power * (p + 8.0 * s * floor(P.power * randVal))

    let newX = f32(0.0)
    let newY = f32(0.0)

    if (p <= 1.0 * s) {
      newX = s
      newY = p
    } else if (p <= 3.0 * s) {
      newX = 2.0 * s - p
      newY = s
    } else if (p <= 5.0 * s) {
      newX = -s
      newY = 4.0 * s - p
    } else if (p <= 7.0 * s) {
      newX = -(6.0 * s - p)
      newY = -s
    } else {
      newX = s
      newY = -(8.0 * s - p)
    }

    return vec2f(newX, newY)
  },
)
