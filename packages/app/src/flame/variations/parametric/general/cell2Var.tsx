import { f32, struct, vec2f } from 'typegpu/data'
import { floor, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type Cell2VarParams = Infer<typeof Cell2VarParams>
const Cell2VarParams = struct({
  size: f32,
  mirror_x: f32,
  mirror_y: f32,
  a: f32,
  space_ya: f32,
  space_xa: f32,
  space_yb: f32,
  space_xb: f32,
  shift_xa: f32,
  space_yc: f32,
  shift_ya: f32,
  space_xc: f32,
  space_yd: f32,
  shift_yb: f32,
  space_xd: f32,
  shift_xb: f32,
})

const Cell2VarParamsDefaults: Cell2VarParams = {
  size: 0.6,
  mirror_x: 0,
  mirror_y: 0,
  a: 1.0,
  space_ya: 2.0,
  space_xa: 2.0,
  space_yb: 2.0,
  space_xb: 2.0,
  shift_xa: 1.0,
  space_yc: 2.0,
  shift_ya: 1.0,
  space_xc: 2.0,
  space_yd: 2.0,
  shift_yb: 1.0,
  space_xd: 2.0,
  shift_xb: 1.0,
}

const Cell2VarParamsEditor: EditorFor<Cell2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'size', 'Size')}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'mirror_x', 'Mirror X')}
      min={0}
      max={1}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'mirror_y', 'Mirror Y')}
      min={0}
      max={1}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space_ya', 'Space YA')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space_xa', 'Space XA')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space_yb', 'Space YB')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space_xb', 'Space XB')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'shift_xa', 'Shift XA')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space_yc', 'Space YC')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'shift_ya', 'Shift YA')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space_xc', 'Space XC')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space_yd', 'Space YD')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'shift_yb', 'Shift YB')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space_xd', 'Space XD')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'shift_xb', 'Shift XB')}
      min={0}
      max={5}
      step={0.01}
    />
  </>
)

export const cell2Var = parametricVariation(
  'cell2Var',
  Cell2VarParams,
  Cell2VarParamsDefaults,
  Cell2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const inv_cell_size = P.a / P.size
    const cx = floor(pos.x * inv_cell_size)
    const cy = floor(pos.y * inv_cell_size)
    const dx = pos.x - cx * P.size
    const dy = pos.y - cy * P.size

    const x_pos = cx >= 0.0
    const y_pos = cy >= 0.0

    const x1 = cx * P.space_xa
    const y1 = cy * P.space_ya

    const x2 = -(P.space_xb * cx + P.shift_xa)
    const y2 = cy * P.space_yb

    const x3 = cx * P.space_xc
    const y3 = -(P.space_yc * cy + P.shift_ya)

    const x4 = -(P.space_xd * cx + P.shift_xb)
    const y4 = -(P.space_yd * cy + P.shift_yb)

    const x_upper = select(x2, x1, x_pos)
    const y_upper = select(y2, y1, x_pos)
    const x_lower = select(x4, x3, x_pos)
    const y_lower = select(y4, y3, x_pos)
    const x_final = select(x_lower, x_upper, y_pos)
    const y_final = select(y_lower, y_upper, y_pos)

    let tx = dx + x_final * P.size
    let ty = -(dy + y_final * P.size)

    if (P.mirror_x > 0.5) {
      tx = select(tx, -tx, random() < 0.5)
    }
    if (P.mirror_y > 0.5) {
      ty = select(ty, -ty, random() < 0.5)
    }

    const newX = varInfo.weight * tx
    const newY = varInfo.weight * ty
    return vec2f(newX, newY)
  },
  'general',
)
