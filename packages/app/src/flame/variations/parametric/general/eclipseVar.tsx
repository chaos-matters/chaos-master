import { f32, struct, vec2f } from 'typegpu/data'
import { abs, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const EclipseVarParams = struct({
  shift: f32,
})

type EclipseVarParams = Infer<typeof EclipseVarParams>

const EclipseVarParamsDefaults: EclipseVarParams = {
  shift: 0.1,
}

const EclipseVarParamsEditor: EditorFor<EclipseVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'shift', 'Shift', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
  </>
)

export const eclipseVar = parametricVariation(
  'eclipseVar',
  EclipseVarParams,
  EclipseVarParamsDefaults,
  EclipseVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const w = varInfo.weight
    const c2 = sqrt(w * w - pos.y * pos.y)
    const xShifted = pos.x + P.shift * w
    const innerCond = abs(pos.y) <= w && abs(pos.x) <= c2
    const flipCond = abs(xShifted) >= c2
    const xOut = select(xShifted, -pos.x, flipCond)
    const result = select(pos, vec2f(xOut, pos.y), innerCond)
    return result
  },
  'general',
)
