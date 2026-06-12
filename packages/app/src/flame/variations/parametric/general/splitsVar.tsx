import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SplitsVarParams = struct({
  x: f32,
  y: f32,
  lshear: f32,
  rshear: f32,
  ushear: f32,
  dshear: f32,
})

type SplitsVarParams = Infer<typeof SplitsVarParams>

const SplitsVarParamsDefaults: SplitsVarParams = {
  x: 0.4,
  y: 0.6,
  lshear: 0.0,
  rshear: 0.0,
  ushear: 0.0,
  dshear: 0.0,
}

const SplitsVarParamsEditor: EditorFor<SplitsVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'X Split', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y Split', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'lshear', 'Left Shear', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'rshear', 'Right Shear', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ushear', 'Up Shear', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'dshear', 'Down Shear', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
  </>
)

export const splitsVar = parametricVariation(
  'splitsVar',
  SplitsVarParams,
  SplitsVarParamsDefaults,
  SplitsVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let nx = pos.x
    let ny = pos.y

    if (pos.x >= 0.0) {
      nx = pos.x + P.x
      ny = ny + P.rshear
    } else {
      nx = pos.x - P.x
      ny = ny - P.lshear
    }

    if (pos.y >= 0.0) {
      ny = ny + P.y
      nx = nx + P.ushear
    } else {
      ny = ny - P.y
      nx = nx - P.dshear
    }

    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
