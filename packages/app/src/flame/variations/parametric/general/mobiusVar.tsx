import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type MobiusVarParams = Infer<typeof MobiusVarParams>
const MobiusVarParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
})

const MobiusVarParamsDefaults: MobiusVarParams = {
  a: 1.0,
  b: 0.0,
  c: 0.0,
  d: 1.0,
}

const MobiusVarParamsEditor: EditorFor<MobiusVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={-3}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={-3}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C')}
      min={-3}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D')}
      min={-3}
      max={3}
      step={0.01}
    />
  </>
)

export const mobiusVar = parametricVariation(
  'mobiusVar',
  MobiusVarParams,
  MobiusVarParamsDefaults,
  MobiusVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const re = P.a * x - P.c * y + P.b
    const im = P.a * y + P.c * x
    const denomRe = P.c * x - P.d * y + P.d
    const denomIm = P.c * y + P.d * x
    const denom = denomRe * denomRe + denomIm * denomIm + 0.0001
    const nx = (re * denomRe + im * denomIm) / denom
    const ny = (im * denomRe - re * denomIm) / denom
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
