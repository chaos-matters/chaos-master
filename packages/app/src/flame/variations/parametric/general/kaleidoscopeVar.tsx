import { f32, struct, vec2f } from 'typegpu/data'
import { cos, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const KaleidoscopeVarParams = struct({
  pull: f32,
  rotate: f32,
  lineUp: f32,
  x: f32,
  y: f32,
})

type KaleidoscopeVarParams = Infer<typeof KaleidoscopeVarParams>

const KaleidoscopeVarParamsDefaults: KaleidoscopeVarParams = {
  pull: 0.0,
  rotate: 1.0,
  lineUp: 1.0,
  x: 0.0,
  y: 0.0,
}

const KaleidoscopeVarParamsEditor: EditorFor<KaleidoscopeVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'pull', 'Pull', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'rotate', 'Rotate', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'lineUp', 'Line Up', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x', 'X', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
  </>
)

export const kaleidoscopeVar = parametricVariation(
  'kaleidoscopeVar',
  KaleidoscopeVarParams,
  KaleidoscopeVarParamsDefaults,
  KaleidoscopeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const angle = PI.$ / 4.0
    const w = P.rotate
    const e = P.lineUp
    const q = P.pull
    const r = P.x
    const t = P.y

    const xOut = w * pos.x * cos(angle) - pos.y * sin(angle) + e + r
    const ybase = w * pos.y * cos(angle) + pos.x * sin(angle)
    const yOut = select(ybase - q - e, ybase + q + e + t, pos.y > 0.0)

    return vec2f(xOut, yOut).mul(varInfo.weight)
  },
  'general',
)
