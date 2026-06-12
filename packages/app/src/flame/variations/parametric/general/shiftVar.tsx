import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type ShiftParams = Infer<typeof ShiftParams>
const ShiftParams = struct({
  shift_x: f32,
  shift_y: f32,
  angle: f32,
})

const ShiftDefaults: ShiftParams = {
  shift_x: 0.1,
  shift_y: 0.06,
  angle: 12.25,
}

const ShiftEditor: EditorFor<ShiftParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'shift_x', 'Shift X')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'shift_y', 'Shift Y')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle')}
      min={-180}
      max={180}
      step={0.1}
    />
  </>
)

export const shiftVar = parametricVariation(
  'shiftVar',
  ShiftParams,
  ShiftDefaults,
  ShiftEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const a = (P.angle * PI.$) / 180.0
    const cs = cos(a)
    const sn = sin(a)
    return vec2f(
      pos.x + cs * P.shift_x - sn * P.shift_y,
      pos.y - cs * P.shift_y - sn * P.shift_x,
    ).mul(varInfo.weight)
  },
  'general',
)
