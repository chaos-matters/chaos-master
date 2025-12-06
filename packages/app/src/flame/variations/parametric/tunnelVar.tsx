import { f32, struct, vec2f } from 'typegpu/data'
import { pow, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const TunnelVarParams = struct({
  Sx: f32,
  Sy: f32,
})

type TunnelVarParams = Infer<typeof TunnelVarParams>

const TunnelVarParamsDefaults: TunnelVarParams = {
  Sx: 200.0,
  Sy: 50.0,
}

const TunnelVarParamsEditor: EditorFor<TunnelVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'Sx', 'Sx')}
      min={1}
      max={250}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'Sy', 'Sy')}
      min={1}
      max={250}
      step={0.1}
    />
  </>
)

export const tunnelVar = parametricVariation(
  'tunnelVar',
  TunnelVarParams,
  TunnelVarParamsDefaults,
  TunnelVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const uv = pos.add(vec2f(0.5))

    const deformVal = 0.1
    const DEFORM_SIZE = deformVal
    const MAX_DISTORTION = deformVal

    const dist = vec2f(0.5).sub(uv)

    const term = uv.y * deformVal - deformVal * 0.5
    const distortion =
      -sqrt(0.25 - pow(term, 2.0)) * DEFORM_SIZE + DEFORM_SIZE * 0.5

    const shiftX = distortion * dist.x * P.Sx

    const deform_y_fixed = (MAX_DISTORTION - distortion) * deformVal
    const shiftY = P.Sy * deform_y_fixed * dist.y

    return vec2f(shiftX, shiftY)
  },
)
