import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, floor, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BWraps7VarParams = struct({
  cellsize: f32,
  space: f32,
  gain: f32,
  inner_twist: f32,
  outer_twist: f32,
})

type BWraps7VarParams = Infer<typeof BWraps7VarParams>

const BWraps7VarParamsDefaults: BWraps7VarParams = {
  cellsize: 1.0,
  space: 0.0,
  gain: 2.0,
  inner_twist: 0.0,
  outer_twist: 0.0,
}

const BWraps7VarParamsEditor: EditorFor<BWraps7VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'cellsize', 'Cell Size', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'space', 'Space', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'gain', 'Gain', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(
        props,
        'inner_twist',
        'Inner Twist',
        props.dataParameterPath,
      )}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(
        props,
        'outer_twist',
        'Outer Twist',
        props.dataParameterPath,
      )}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const bwraps7Var = parametricVariation(
  'bwraps7Var',
  BWraps7VarParams,
  BWraps7VarParamsDefaults,
  BWraps7VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    if (abs(P.cellsize) < EPS.$) {
      return vec2f(pos.x, pos.y).mul(varInfo.weight)
    }

    // precalc: init values computed inline
    const radius = 0.5 * (P.cellsize / (1.0 + P.space * P.space))
    const g2 = P.gain * P.gain + 0.000001
    let max_bubble = g2 * radius
    if (max_bubble > 2.0) {
      max_bubble = 1.0
    } else {
      max_bubble *= 1.0 / ((max_bubble * max_bubble) / 4.0 + 1.0)
    }
    const r2 = radius * radius
    const rfactor = radius / max_bubble

    const Cx = (floor(pos.x / P.cellsize) + 0.5) * P.cellsize
    const Cy = (floor(pos.y / P.cellsize) + 0.5) * P.cellsize

    let Lx = pos.x - Cx
    let Ly = pos.y - Cy

    if (Lx * Lx + Ly * Ly > r2) {
      return vec2f(pos.x, pos.y).mul(varInfo.weight)
    }

    Lx *= g2
    Ly *= g2
    let r_comp = rfactor / ((Lx * Lx + Ly * Ly) / 4.0 + 1.0)
    Lx *= r_comp
    Ly *= r_comp

    r_comp = (Lx * Lx + Ly * Ly) / r2
    const theta = P.inner_twist * (1.0 - r_comp) + P.outer_twist * r_comp
    const s = sin(theta)
    const c = cos(theta)

    return vec2f(Cx + c * Lx + s * Ly, Cy - s * Lx + c * Ly).mul(varInfo.weight)
  },
  'general',
)
