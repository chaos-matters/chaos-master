import { f32, struct, vec2f } from 'typegpu/data'
import { abs, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const AugerVarParams = struct({
  freq: f32,
  weight: f32,
  sym: f32,
  scale: f32,
})
type AugerVarParams = Infer<typeof AugerVarParams>
const AugerVarParamsDefaults: AugerVarParams = {
  freq: 1.0,
  weight: 0.5,
  sym: 0.0,
  scale: 1.0,
}
const AugerVarParamsEditor: EditorFor<AugerVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'freq', 'Freq')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'weight', 'Weight')}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'sym', 'Sym')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0}
      max={5}
      step={0.01}
    />
  </>
)
export const augerVar = parametricVariation(
  'augerVar',
  AugerVarParams,
  AugerVarParamsDefaults,
  AugerVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const s = sin(P.freq * pos.x)
    const t = sin(P.freq * pos.y)
    let dx = pos.x + P.weight * ((P.scale * t) / 2.0 + abs(pos.x) * t)
    let dy = pos.y + P.weight * ((P.scale * s) / 2.0 + abs(pos.y) * s)
    if (P.sym !== 0.0) {
      dx = dx + P.weight * ((P.scale * s) / 2.0 + abs(pos.x) * s)
      dy = dy + P.weight * ((P.scale * t) / 2.0 + abs(pos.y) * t)
    }
    const newX = varInfo.weight * dx
    const newY = varInfo.weight * dy
    return vec2f(newX, newY)
  },
  'general',
)
