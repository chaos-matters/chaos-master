import { f32, struct, vec2f } from 'typegpu/data'
import { sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const TriangleVarParams = struct({
  x1: f32,
  y1: f32,
  x2: f32,
  y2: f32,
  x3: f32,
  y3: f32,
})

type TriangleVarParams = Infer<typeof TriangleVarParams>

const TriangleVarParamsDefaults: TriangleVarParams = {
  x1: -0.2,
  y1: -0.1,
  x2: 0.2,
  y2: -0.1,
  x3: 0.2,
  y3: 0.1,
}

const TriangleVarParamsEditor: EditorFor<TriangleVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x1', 'X1', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y1', 'Y1', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x2', 'X2', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y2', 'Y2', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x3', 'X3', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y3', 'Y3', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
  </>
)

export const triangleVar = parametricVariation(
  'triangleVar',
  TriangleVarParams,
  TriangleVarParamsDefaults,
  TriangleVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sqrtR1 = sqrt(random())
    const r2 = random()
    const a = 1.0 - sqrtR1
    const b = sqrtR1 * (1.0 - r2)
    const c = r2 * sqrtR1
    const dx = a * P.x1 + b * P.x2 + c * P.x3
    const dy = a * P.y1 + b * P.y2 + c * P.y3
    return vec2f(dx, dy).mul(varInfo.weight)
  },
  'general',
)
