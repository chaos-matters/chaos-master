import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, max, pow, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const GlynnSim3VarParams = struct({
  radius: f32,
  thickness: f32,
  contrast: f32,
  pow: f32,
})

type GlynnSim3VarParams = Infer<typeof GlynnSim3VarParams>

const GlynnSim3VarParamsDefaults: GlynnSim3VarParams = {
  radius: 1.0,
  thickness: 0.1,
  contrast: 0.5,
  pow: 1.5,
}

const GlynnSim3VarParamsEditor: EditorFor<GlynnSim3VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'thickness', 'Thickness', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'contrast', 'Contrast', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'pow', 'Pow', props.dataParameterPath)}
      min={0.1}
      max={10.0}
      step={0.01}
    />
  </>
)

export const glynnSim3Var = parametricVariation(
  'glynnSim3Var',
  GlynnSim3VarParams,
  GlynnSim3VarParamsDefaults,
  GlynnSim3VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const rad1 = P.radius + P.thickness
    const rad2 = (P.radius * P.radius) / max(rad1, EPS.$)
    const gamma = rad1 / (rad1 + rad2)
    const absPow = abs(P.pow)

    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const alpha = select(P.radius / max(r, EPS.$), 1.0, r < EPS.$)

    // Circle2 helper: random point on one of two concentric circles
    const phi = 2.0 * PI.$ * random()
    const cr = select(rad2, rad1, random() < gamma)
    const cx = cr * cos(phi)
    const cy = cr * sin(phi)

    const passthrough = random() > P.contrast * pow(alpha, absPow)

    return select(
      select(
        vec2f(pos.x, pos.y),
        vec2f(alpha * alpha * pos.x, alpha * alpha * pos.y),
        passthrough,
      ),
      vec2f(cx, cy),
      r < rad1,
    ).mul(varInfo.weight)
  },
  'general',
)
