import { f32, i32, struct, vec2f } from 'typegpu/data'
import { abs, dot, floor, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CutApollonianVarParams = struct({
  mode: f32,
  levels: f32,
  zoom: f32,
  invert: f32,
})
type CutApollonianVarParams = Infer<typeof CutApollonianVarParams>
const CutApollonianVarParamsDefaults: CutApollonianVarParams = {
  mode: 1.0,
  levels: 4.0,
  zoom: 2.0,
  invert: 0.0,
}
const CutApollonianVarParamsEditor: EditorFor<CutApollonianVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'mode', 'Mode')}
      min={0}
      max={1}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'levels', 'Levels')}
      min={1}
      max={10}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'zoom', 'Zoom')}
      min={0.1}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'invert', 'Invert')}
      min={0}
      max={1}
      step={1}
    />
  </>
)
export const cutApollonianVar = parametricVariation(
  'cutApollonianVar',
  CutApollonianVarParams,
  CutApollonianVarParamsDefaults,
  CutApollonianVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let x = pos.x
    let y = pos.y
    const useInput = P.mode < 0.5
    x = select(random() - 0.5, pos.x, useInput)
    y = select(random() - 0.5, pos.y, useInput)
    let px = x * P.zoom
    let py = y * P.zoom
    let scale = f32(1.0)
    const lvls = i32(P.levels)
    for (let i = 0; i < lvls; i++) {
      px = (px * 0.5 + 0.5 - f32(floor(px * 0.5 + 0.5))) * 2.0 - 1.0
      py = (py * 0.5 + 0.5 - f32(floor(py * 0.5 + 0.5))) * 2.0 - 1.0
      const k = 1.38 / dot(vec2f(px, py), vec2f(px, py))
      px *= k
      py *= k
      scale *= k
    }
    const col = (0.25 * abs(py)) / scale
    let keep = false
    if (P.invert < 0.5) {
      keep = col <= 0.001 // Threshold for "zero"
    } else {
      keep = col > 0.001
    }
    const newX = select(0.0, x, keep)
    const newY = select(0.0, y, keep)
    return vec2f(varInfo.weight * newX, varInfo.weight * newY)
  },
  'cut',
)
