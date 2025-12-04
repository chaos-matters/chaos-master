import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type LorenzAttractorParams = Infer<typeof LorenzAttractorParams>
const LorenzAttractorParams = struct({
  sigma: f32,
  rho: f32,
  beta: f32,
  scale: f32,
  steps: f32,
})

const LorenzAttractorParamsDefaults: LorenzAttractorParams = {
  sigma: 10.0,
  rho: 28.0,
  beta: 8.0 / 3.0,
  scale: 0.045,
  steps: 200,
}

const LorenzAttractorParamsEditor: EditorFor<LorenzAttractorParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'sigma', 'Sigma')}
      min={0}
      max={20}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'rho', 'Rho')}
      min={0}
      max={50}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'beta', 'Beta')}
      min={0}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'steps', 'Steps')}
      min={1}
      max={1500}
      step={1}
    />
  </>
)

export const lorenzAttractor = parametricVariation(
  'lorenzAttractor',
  LorenzAttractorParams,
  LorenzAttractorParamsDefaults,
  LorenzAttractorParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let x = pos.x
    let y = pos.y
    let z = 0.0

    const sigma = P.sigma
    const rho = P.rho
    const beta = P.beta
    const steps = P.steps
    const dt = 0.01
    const scale = P.scale

    for (let i = 0; i < steps; i = i + 1) {
      const dx = sigma * (y - x)
      const dy = x * (rho - z) - y
      const dz = x * y - beta * z

      x = x + dt * dx
      y = y + dt * dy
      z = z + dt * dz
    }

    const u = varInfo.weight * scale * x
    const v = varInfo.weight * scale * y

    return vec2f(u, v)
  },
)
