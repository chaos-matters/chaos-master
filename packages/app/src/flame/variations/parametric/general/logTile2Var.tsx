import { f32, struct, vec2f } from 'typegpu/data'
import { log, round, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const LogTile2VarParams = struct({
  spreadx: f32,
  spready: f32,
})

type LogTile2VarParams = Infer<typeof LogTile2VarParams>

const LogTile2VarParamsDefaults: LogTile2VarParams = {
  spreadx: 2.0,
  spready: 2.0,
}

const LogTile2VarParamsEditor: EditorFor<LogTile2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'spreadx', 'Spread X', props.dataParameterPath)}
      min={0.1}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'spready', 'Spread Y', props.dataParameterPath)}
      min={0.1}
      max={10}
      step={0.01}
    />
  </>
)

export const logTile2Var = parametricVariation(
  'logTile2Var',
  LogTile2VarParams,
  LogTile2VarParamsDefaults,
  LogTile2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const spreadx = select(-P.spreadx, P.spreadx, random() < 0.5)
    const spready = select(-P.spready, P.spready, random() < 0.5)
    return vec2f(
      pos.x + spreadx * round(log(random())),
      pos.y + spready * round(log(random())),
    ).mul(varInfo.weight)
  },
  'general',
)
