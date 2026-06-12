import { f32, struct, vec2f } from 'typegpu/data'
import { cos, exp, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type SeaShellVarParams = Infer<typeof SeaShellVarParams>
const SeaShellVarParams = struct({
  turns: f32,
  tightness: f32,
})

const SeaShellVarParamsDefaults: SeaShellVarParams = {
  turns: 4,
  tightness: 0.2,
}

const SeaShellVarParamsEditor: EditorFor<SeaShellVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'turns', 'Turns')}
      min={1}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'tightness', 'Tightness')}
      min={0.05}
      max={1.0}
      step={0.01}
    />
  </>
)

export const seaShellVar = parametricVariation(
  'seaShellVar',
  SeaShellVarParams,
  SeaShellVarParamsDefaults,
  SeaShellVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const t = (pos.x + 1.0) * P.turns * PI.$
    const r = exp(P.tightness * t)
    const nx = r * cos(t)
    const ny = r * sin(t) * 0.6
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
