import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ModulusVarParams = struct({
  x: f32,
  y: f32,
})

type ModulusVarParams = Infer<typeof ModulusVarParams>

const ModulusVarParamsDefaults: ModulusVarParams = {
  x: 0.2,
  y: 0.5,
}

const ModulusVarParamsEditor: EditorFor<ModulusVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'X', props.dataParameterPath)}
      min={0.01}
      max={3.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y', props.dataParameterPath)}
      min={0.01}
      max={3.0}
      step={0.01}
    />
  </>
)

export const modulusVar = parametricVariation(
  'modulusVar',
  ModulusVarParams,
  ModulusVarParamsDefaults,
  ModulusVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xr = 2.0 * P.x
    const yr = 2.0 * P.y

    let nx = pos.x
    if (pos.x > xr) {
      nx = -P.x + ((pos.x + P.x) % xr)
    } else if (pos.x < -xr) {
      nx = P.x - ((P.x - pos.x) % xr)
    }

    let ny = pos.y
    if (pos.y > yr) {
      ny = -P.y + ((pos.y + P.y) % yr)
    } else if (pos.y < -yr) {
      ny = P.y - ((P.y - pos.y) % yr)
    }

    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
