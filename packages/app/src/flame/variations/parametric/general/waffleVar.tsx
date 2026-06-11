import { f32, struct, vec2f } from 'typegpu/data'
import { cos, floor, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const WaffleVarParams = struct({
  slices: f32,
  xthickness: f32,
  ythickness: f32,
  rotation: f32,
})

type WaffleVarParams = Infer<typeof WaffleVarParams>

const WaffleVarParamsDefaults: WaffleVarParams = {
  slices: 6,
  xthickness: 0.5,
  ythickness: 0.5,
  rotation: 0.0,
}

const WaffleVarParamsEditor: EditorFor<WaffleVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'slices', 'Slices', props.dataParameterPath)}
      min={2}
      max={20}
      step={1}
    />
    <RangeEditor
      {...editorProps(
        props,
        'xthickness',
        'X Thickness',
        props.dataParameterPath,
      )}
      min={0.01}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(
        props,
        'ythickness',
        'Y Thickness',
        props.dataParameterPath,
      )}
      min={0.01}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'rotation', 'Rotation', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
  </>
)

export const waffleVar = parametricVariation(
  'waffleVar',
  WaffleVarParams,
  WaffleVarParamsDefaults,
  WaffleVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const s = P.slices
    const xt = P.xthickness
    const yt = P.ythickness

    const vr = cos(P.rotation)
    const vs = sin(P.rotation)

    let aa = pos.x
    let rr = pos.y
    const sw = f32(floor(random() * 5.0))

    if (sw < 1.0) {
      aa = (f32(floor(random() * s)) + random() * xt) / s
      rr = (f32(floor(random() * s)) + random() * yt) / s
    } else if (sw < 2.0) {
      aa = (f32(floor(random() * s)) + random()) / s
      rr = (f32(floor(random() * s)) + yt) / s
    } else if (sw < 3.0) {
      aa = (f32(floor(random() * s)) + xt) / s
      rr = (f32(floor(random() * s)) + random()) / s
    } else if (sw < 4.0) {
      aa = random()
      rr = (f32(floor(random() * s)) + yt + random() * (1.0 - yt)) / s
    } else {
      aa = (f32(floor(random() * s)) + xt + random() * (1.0 - xt)) / s
      rr = random()
    }

    return vec2f(vr * aa + vs * rr, -vs * aa + vr * rr).mul(varInfo.weight)
  },
  'general',
)
