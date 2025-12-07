import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const LineVarParams = struct({
  delta: f32,
  phi: f32,
})

type LineVarParams = Infer<typeof LineVarParams>

const LineVarParamsDefaults: LineVarParams = {
  delta: 0.0,
  phi: 0.0,
}

const LineVarParamsEditor: EditorFor<LineVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'delta', 'Delta')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'phi', 'Phi')}
      min={0}
      max={1}
      step={0.01}
    />
  </>
)

export const lineVar = parametricVariation(
  'lineVar',
  LineVarParams,
  LineVarParamsDefaults,
  LineVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'

    const uxVal = cos(P.delta * PI.$) * cos(P.phi * PI.$)
    const uyVal = sin(P.delta * PI.$) * cos(P.phi * PI.$)
    const uzVal = sin(P.phi * PI.$)

    const r = sqrt(uxVal * uxVal + uyVal * uyVal + uzVal * uzVal)

    // Normalize
    // Note: If r is 0, this yields NaNs, but default params are safe.
    const ux = uxVal / r
    const uy = uyVal / r
    // uz is calculated in Java but not used for X/Y projection below

    // Java: rand = random() * pAmount
    // We remove pAmount (weight) from calculation as it is applied externally.
    const rand = random()

    const newX = pos.x + ux * rand
    const newY = pos.y + uy * rand

    return vec2f(newX, newY)
  },
)
