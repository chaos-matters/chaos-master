import { f32, struct, vec2f } from 'typegpu/data'
import { abs, round, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Boarders2VarParams = struct({
  c: f32,
  left: f32,
  right: f32,
  bottom: f32,
  top: f32,
})
type Boarders2VarParams = Infer<typeof Boarders2VarParams>
const Boarders2VarParamsDefaults: Boarders2VarParams = {
  c: 0.0,
  left: 0.0,
  right: 0.0,
  bottom: 0.0,
  top: 0.0,
}
const Boarders2VarParamsEditor: EditorFor<Boarders2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'c', 'C')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'left', 'Left')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'right', 'Right')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'bottom', 'Bottom')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'top', 'Top')}
      min={0}
      max={1}
      step={0.01}
    />
  </>
)
export const boarders2Var = parametricVariation(
  'boarders2Var',
  Boarders2VarParams,
  Boarders2VarParamsDefaults,
  Boarders2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const cl = P.c * P.left
    const cr = P.c + P.c * P.right
    const ct = P.c + P.c * P.top
    const roundX = round(pos.x)
    const roundY = round(pos.y)
    const offsetX = pos.x - roundX
    const offsetY = pos.y - roundY
    let dx = pos.x
    let dy = pos.y
    if (random() >= cr) {
      dx = offsetX * P.c + roundX
      dy = offsetY * P.c + roundY
    } else {
      if (abs(offsetX) >= abs(offsetY)) {
        if (offsetX >= 0.0) {
          dx = offsetX * P.c + roundX + cl
          dy =
            offsetY * P.c +
            roundY +
            (cl * offsetY) / select(offsetX, 1e-9, offsetX === 0.0)
        } else {
          dx = offsetX * P.c + roundX - cl
          dy =
            offsetY * P.c +
            roundY -
            (cl * offsetY) / select(offsetX, 1e-9, offsetX === 0.0)
        }
      } else {
        if (offsetY >= 0.0) {
          dx =
            offsetX * P.c +
            roundX +
            (ct * offsetX) / select(offsetY, 1e-9, offsetY === 0.0)
          dy = offsetY * P.c + roundY + ct
        } else {
          dx =
            offsetX * P.c +
            roundX -
            (ct * offsetX) / select(offsetY, 1e-9, offsetY === 0.0)
          dy = offsetY * P.c + roundY - ct // Should use cb?
        }
      }
    }
    const newX = varInfo.weight * dx
    const newY = varInfo.weight * dy
    return vec2f(newX, newY)
  },
  'general',
)
