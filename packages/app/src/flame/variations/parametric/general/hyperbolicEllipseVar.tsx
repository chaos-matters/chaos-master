import { f32, struct, vec2f } from 'typegpu/data'
import { cos, exp, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const HyperbolicEllipseVarParams = struct({
  a: f32,
})

type HyperbolicEllipseVarParams = Infer<typeof HyperbolicEllipseVarParams>

const HyperbolicEllipseVarParamsDefaults: HyperbolicEllipseVarParams = {
  a: 1.0,
}

const HyperbolicEllipseVarParamsEditor: EditorFor<
  HyperbolicEllipseVarParams
> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={0.1}
      max={10.0}
      step={0.1}
    />
  </>
)

export const hyperbolicEllipseVar = parametricVariation(
  'hyperbolicEllipseVar',
  HyperbolicEllipseVarParams,
  HyperbolicEllipseVarParamsDefaults,
  HyperbolicEllipseVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const ex = exp(pos.x)
    const emx = exp(-pos.x)
    const xt = (ex - emx) * 0.5 * cos(P.a * pos.y)
    const yt = (ex + emx) * 0.5 * sin(P.a * pos.y)
    return vec2f(xt, yt).mul(varInfo.weight)
  },
  'general',
)
