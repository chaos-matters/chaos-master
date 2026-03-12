import { f32, struct, vec2f } from 'typegpu/data'
import { abs, pow, sign } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const LinearTVarParams = struct({
  powX: f32,
  powY: f32,
})

type LinearTVarParams = Infer<typeof LinearTVarParams>

const LinearTVarParamsDefaults: LinearTVarParams = {
  powX: 1.2,
  powY: 0.9,
}

const LinearTVarParamsEditor: EditorFor<LinearTVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'powX', 'Pow X')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'powY', 'Pow Y')}
      min={0}
      max={5}
      step={0.01}
    />
  </>
)

export const linearTVar = parametricVariation(
  'linearTVar',
  LinearTVarParams,
  LinearTVarParamsDefaults,
  LinearTVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'

    // Java sgn: arg > 0 ? 1 : -1. GPU code: x < 0 ? -1 : 1.
    // sign(x) returns -1, 0, or 1.
    // Since pow(abs(0), p) is 0, the sign at 0 doesn't impact the result magnitude.
    // We use sign() for cleaner GPU code.

    const newX = sign(pos.x) * pow(abs(pos.x), P.powX)
    const newY = sign(pos.y) * pow(abs(pos.y), P.powY)

    return vec2f(newX, newY)
  },
)
