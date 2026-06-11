import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, max, pow, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const GlynnSim1VarParams = struct({
  radius: f32,
  radius1: f32,
  phi1: f32,
  thickness: f32,
  pow: f32,
  contrast: f32,
})

type GlynnSim1VarParams = Infer<typeof GlynnSim1VarParams>

const GlynnSim1VarParamsDefaults: GlynnSim1VarParams = {
  radius: 1.0,
  radius1: 0.1,
  phi1: 110.0,
  thickness: 0.1,
  pow: 1.5,
  contrast: 0.5,
}

const GlynnSim1VarParamsEditor: EditorFor<GlynnSim1VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'radius1', 'Radius1', props.dataParameterPath)}
      min={0.01}
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
      {...editorProps(props, 'thickness', 'Thickness', props.dataParameterPath)}
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
      {...editorProps(props, 'contrast', 'Contrast', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={0.01}
    />
  </>
)

export const glynnSim1Var = parametricVariation(
  'glynnSim1Var',
  GlynnSim1VarParams,
  GlynnSim1VarParamsDefaults,
  GlynnSim1VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const phiRad = (P.phi1 * PI.$) / 180.0
    const x1 = P.radius * cos(phiRad)
    const y1 = P.radius * sin(phiRad)
    const absPow = abs(P.pow)

    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const alpha = select(P.radius / max(r, EPS.$), 1.0, r < EPS.$)

    // Circle helper: random point near (x1, y1) given radius1 + thickness blending
    const crRad = P.radius1 + P.thickness * P.radius1 * random()
    const crPhi = 2.0 * PI.$ * random()
    const cx = x1 + crRad * cos(crPhi)
    const cy = y1 + crRad * sin(crPhi)

    const passthrough = random() > P.contrast * pow(alpha, absPow)
    const mappedX = select(alpha * alpha * pos.x, pos.x, passthrough)
    const mappedY = select(alpha * alpha * pos.y, pos.y, passthrough)

    const zDist =
      (mappedX - x1) * (mappedX - x1) + (mappedY - y1) * (mappedY - y1)

    return select(
      vec2f(mappedX, mappedY),
      vec2f(cx, cy),
      r < P.radius || zDist < P.radius1 * P.radius1,
    ).mul(varInfo.weight)
  },
  'general',
)
