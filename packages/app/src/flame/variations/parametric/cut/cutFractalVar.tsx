import { f32, i32, struct, vec2f } from 'typegpu/data'
import { abs, cos, dot, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CutFractalVarParams = struct({
  seed: f32,
  mode: f32,
  time: f32,
  iters: f32,
  zoom: f32,
  invert: f32,
})
type CutFractalVarParams = Infer<typeof CutFractalVarParams>
const CutFractalVarParamsDefaults: CutFractalVarParams = {
  seed: 0.0,
  mode: 1.0,
  time: 0.0,
  iters: 30.0,
  zoom: 1.0,
  invert: 0.0,
}
const CutFractalVarParamsEditor: EditorFor<CutFractalVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'seed', 'Seed')}
      min={0}
      max={1000}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'mode', 'Mode')}
      min={0}
      max={1}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'time', 'Time')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'iters', 'Iters')}
      min={1}
      max={100}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'zoom', 'Zoom')}
      min={0.1}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'invert', 'Invert')}
      min={0}
      max={1}
      step={1}
    />
  </>
)
export const cutFractalVar = parametricVariation(
  'cutFractalVar',
  CutFractalVarParams,
  CutFractalVarParamsDefaults,
  CutFractalVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let x = pos.x
    let y = pos.y
    const useInput = P.mode < 0.5
    x = select(random() - 0.5, pos.x, useInput)
    y = select(random() - 0.5, pos.y, useInput)
    const cx = cos(P.time + 1.5) * 0.15 - 0.25
    const cy = sin(P.time + 1.8) * 0.15 - 0.25
    let U = vec2f(y * P.zoom, x * P.zoom) // t.y, t.x
    const iter = i32(P.iters)
    for (let i = 0; i < iter; i++) {
      const d = dot(U, U)
      const factor = 0.5 / select(d, 1.0e-9, d === 0.0)
      const absUx = abs(U.x)
      const absUy = abs(U.y)
      U = vec2f(absUx * factor + cx, absUy * factor + cy)
    }
    const color = abs(dot(U, U) - 0.01) * 2.0
    const d = select(1.0, color, color < 1.0) // min(color, 1.0)
    const threshold = 0.005
    let keep = false
    if (P.invert < 0.5) {
      keep = d <= threshold
    } else {
      keep = d > threshold
    }
    const newX = select(0.0, x, keep)
    const newY = select(0.0, y, keep)
    return vec2f(varInfo.weight * newX, varInfo.weight * newY)
  },
  'cut',
)
