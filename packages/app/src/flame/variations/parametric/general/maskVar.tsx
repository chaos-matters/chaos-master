import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, cosh, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const MaskVarParams = struct({
  xshift: f32,
  yshift: f32,
  ushift: f32,
  xscale: f32,
  yscale: f32,
})

type MaskVarParams = Infer<typeof MaskVarParams>

const MaskVarParamsDefaults: MaskVarParams = {
  xshift: 0.0,
  yshift: 0.0,
  ushift: 1.0,
  xscale: 1.0,
  yscale: 1.0,
}

const MaskVarParamsEditor: EditorFor<MaskVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'xshift', 'X Shift', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'yshift', 'Y Shift', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ushift', 'U Shift', props.dataParameterPath)}
      min={-1}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xscale', 'X Scale', props.dataParameterPath)}
      min={0}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'yscale', 'Y Scale', props.dataParameterPath)}
      min={0}
      max={3}
      step={0.01}
    />
  </>
)

export const maskVar = parametricVariation(
  'maskVar',
  MaskVarParams,
  MaskVarParamsDefaults,
  MaskVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sumsq = pos.x * pos.x + pos.y * pos.y
    if (abs(sumsq) < EPS.$) {
      return vec2f(0.0, 0.0).mul(varInfo.weight)
    }
    const xfactor = P.xscale * pos.x + P.xshift
    const yfactor = P.yscale * pos.y + P.yshift
    const s = sin(xfactor)
    const factor = (1.0 / sumsq) * s * (cosh(yfactor) + P.ushift) * (s * s)
    return vec2f(factor * s, factor * cos(xfactor)).mul(varInfo.weight)
  },
  'general',
)
