import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, max, pow, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const GlynnSim2VarParams = struct({
  radius: f32,
  thickness: f32,
  contrast: f32,
  pow: f32,
  phi1: f32,
  phi2: f32,
})

type GlynnSim2VarParams = Infer<typeof GlynnSim2VarParams>

const GlynnSim2VarParamsDefaults: GlynnSim2VarParams = {
  radius: 1.0,
  thickness: 0.1,
  contrast: 0.5,
  pow: 1.5,
  phi1: 110.0,
  phi2: 150.0,
}

const GlynnSim2VarParamsEditor: EditorFor<GlynnSim2VarParams> = (props) => (
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
      max={1.0}
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
    <RangeEditor
      {...editorProps(props, 'phi1', 'Phi1', props.dataParameterPath)}
      min={-360.0}
      max={360.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'phi2', 'Phi2', props.dataParameterPath)}
      min={-360.0}
      max={360.0}
      step={0.1}
    />
  </>
)

export const glynnSim2Var = parametricVariation(
  'glynnSim2Var',
  GlynnSim2VarParams,
  GlynnSim2VarParamsDefaults,
  GlynnSim2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const phi10 = (P.phi1 * PI.$) / 180.0
    const phi20 = (P.phi2 * PI.$) / 180.0
    const delta = phi20 - phi10
    const gamma =
      (P.thickness * (2.0 * P.radius + P.thickness)) /
      max(P.radius + P.thickness, EPS.$)
    const absPow = abs(P.pow)

    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const alpha = select(P.radius / max(r, EPS.$), 1.0, r < EPS.$)

    // Circle helper inlined: random point in annular ring
    const cr = P.radius + P.thickness - gamma * random()
    const cPhi = phi10 + delta * random()
    const cx = cr * cos(cPhi)
    const cy = cr * sin(cPhi)

    const passthrough = random() > P.contrast * pow(alpha, absPow)

    return select(
      select(
        vec2f(pos.x, pos.y),
        vec2f(alpha * alpha * pos.x, alpha * alpha * pos.y),
        passthrough,
      ),
      vec2f(cx, cy),
      r < P.radius,
    ).mul(varInfo.weight)
  },
  'general',
)
