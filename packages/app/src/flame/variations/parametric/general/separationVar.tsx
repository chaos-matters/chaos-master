import { f32, struct, vec2f } from 'typegpu/data'
import { select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SeparationVarParams = struct({
  xSep: f32,
  xInside: f32,
  ySep: f32,
  yInside: f32,
})

type SeparationVarParams = Infer<typeof SeparationVarParams>

const SeparationVarParamsDefaults: SeparationVarParams = {
  xSep: 0.5,
  xInside: 0.05,
  ySep: 0.25,
  yInside: 0.025,
}

const SeparationVarParamsEditor: EditorFor<SeparationVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'xSep', 'X Sep', props.dataParameterPath)}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xInside', 'X Inside', props.dataParameterPath)}
      min={0}
      max={1}
      step={0.001}
    />
    <RangeEditor
      {...editorProps(props, 'ySep', 'Y Sep', props.dataParameterPath)}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'yInside', 'Y Inside', props.dataParameterPath)}
      min={0}
      max={1}
      step={0.001}
    />
  </>
)

export const separationVar = parametricVariation(
  'separationVar',
  SeparationVarParams,
  SeparationVarParamsDefaults,
  SeparationVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sx2 = P.xSep * P.xSep
    const sy2 = P.ySep * P.ySep
    const nx = select(
      -(sqrt(pos.x * pos.x + sx2) + pos.x * P.xInside),
      sqrt(pos.x * pos.x + sx2) - pos.x * P.xInside,
      pos.x > 0.0,
    )
    const ny = select(
      -(sqrt(pos.y * pos.y + sy2) + pos.y * P.yInside),
      sqrt(pos.y * pos.y + sy2) - pos.y * P.yInside,
      pos.y > 0.0,
    )
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
