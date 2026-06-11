import { f32, struct, vec2f } from 'typegpu/data'
import { CheckboxEditor } from '@/components/Sliders/ParametricEditors/CheckboxEditor'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type InvEllipseParams = Infer<typeof InvEllipseParams>
const InvEllipseParams = struct({
  a: f32,
  b: f32,
  h: f32,
  k: f32,
  restricted: f32,
})

const InvEllipseParamsDefaults: InvEllipseParams = {
  a: 0.65,
  b: 0.5,
  h: 0,
  k: 0,
  restricted: 1.0,
}

const InvEllipseParamsEditor: EditorFor<InvEllipseParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'Major axis', props.dataParameterPath)}
      min={-10}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'Minor axis', props.dataParameterPath)}
      min={-10}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'h', 'Center x', props.dataParameterPath)}
      min={-10}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'k', 'Center y', props.dataParameterPath)}
      min={-10}
      max={10}
      step={0.01}
    />
    <CheckboxEditor
      {...editorProps(
        props,
        'restricted',
        'Restricted',
        props.dataParameterPath,
      )}
    />
  </>
)

export const invEllipse = parametricVariation(
  'invEllipseVar',
  InvEllipseParams,
  InvEllipseParamsDefaults,
  InvEllipseParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const dx = pos.x - P.h
    const dy = pos.y - P.k
    const dx2 = dx * dx
    const dy2 = dy * dy
    const a2 = P.a * P.a
    const b2 = P.b * P.b
    const denom = dx2 / a2 + dy2 / b2

    // restricted/unrestricted elipse handling
    if (P.restricted > 0.0) {
      if (denom < 1) {
        return vec2f(pos).mul(varInfo.weight)
      }
    }
    const u = P.h + dx / denom
    const v = P.k + dy / denom
    return vec2f(u, v).mul(varInfo.weight)
  },
  'general',
)
