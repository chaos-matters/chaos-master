import { f32, struct, vec2f } from 'typegpu/data'
import { floor, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CutCircleDesignVarParams = struct({
  seed: f32,
  mode: f32,
  time: f32,
  zoom: f32,
  invert: f32,
})
type CutCircleDesignVarParams = Infer<typeof CutCircleDesignVarParams>
const CutCircleDesignVarParamsDefaults: CutCircleDesignVarParams = {
  seed: 1000.0,
  mode: 1.0,
  time: 0.0,
  zoom: 10.0,
  invert: 0.0,
}
const CutCircleDesignVarParamsEditor: EditorFor<CutCircleDesignVarParams> = (
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
      {...editorProps(props, 'time', 'Time')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'zoom', 'Zoom')}
      min={1}
      max={50}
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
export const cutCircleDesignVar = parametricVariation(
  'cutCircleDesignVar',
  CutCircleDesignVarParams,
  CutCircleDesignVarParamsDefaults,
  CutCircleDesignVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let x = pos.x
    let y = pos.y
    const useInput = P.mode < 0.5
    x = select(random() - 0.5, pos.x, useInput)
    y = select(random() - 0.5, pos.y, useInput)
    let ux = x * P.zoom + P.time * 0.2
    let uy = y * P.zoom + P.time * 0.2
    ux = ux - floor(ux) - 0.5
    uy = uy - floor(uy) - 0.5
    let r = 0.8
    const len = sqrt(ux * ux + uy * uy)
    let d = select(0.0, 1.0, len < r)
    for (let i = 0; i < 9; i++) {
      r *= 0.5 + 0.1 * sin(f32(i) + P.time)
      const v0 = sqrt(ux * ux + (uy + r) * (uy + r))
      const v1 = sqrt((ux + r) * (ux + r) + uy * uy)
      const v2 = sqrt(ux * ux + (uy - r) * (uy - r))
      const v3 = sqrt((ux - r) * (ux - r) + uy * uy)
      const s0 = select(0.0, 1.0, v0 < r)
      const s1 = select(0.0, 1.0, v1 < r)
      const s2 = select(0.0, 1.0, v2 < r)
      const s3 = select(0.0, 1.0, v3 < r)
      if (i % 2 === 0) {
        d -= s0
        d -= s1
        d -= s2
        d -= s3
      } else {
        d += s0
        d += s1
        d += s2
        d += s3
      }
    }
    const color = d
    let keep = false
    if (P.invert < 0.5) {
      keep = color > 0.0
    } else {
      keep = color <= 0.0
    }
    const newX = select(0.0, x, keep)
    const newY = select(0.0, y, keep)
    return vec2f(varInfo.weight * newX, varInfo.weight * newY)
  },
  'cut',
)
