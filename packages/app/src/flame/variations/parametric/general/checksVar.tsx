import { f32, struct, vec2f } from 'typegpu/data'
import { round, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ChecksVarParams = struct({
  x: f32,
  y: f32,
  size: f32,
  rnd: f32,
})
type ChecksVarParams = Infer<typeof ChecksVarParams>
const ChecksVarParamsDefaults: ChecksVarParams = {
  x: 3.0,
  y: 3.0,
  size: 1.0,
  rnd: 0.5,
}
const ChecksVarParamsEditor: EditorFor<ChecksVarParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'x', 'X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'y', 'Y')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'size', 'Size')} min={0.01} max={5} />
    <RangeEditor {...editorProps(props, 'rnd', 'Rnd')} min={0} max={2} />
  </>
)
export const checksVar = parametricVariation(
  'checksVar',
  ChecksVarParams,
  ChecksVarParamsDefaults,
  ChecksVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const cs = 1.0 / (P.size + 1.0e-6)
    const ncx = P.x * -1.0
    const ncy = P.y * -1.0
    const isXY = f32(round(pos.x * cs)) + f32(round(pos.y * cs))
    const rnx = P.rnd * random()
    const rny = P.rnd * random()
    const isEven = isXY % 2.0 === 0.0
    const dx = select(P.x, ncx + rnx, isEven)
    const dy = select(P.y + rny, ncy, isEven)
    return vec2f(
      pos.x + varInfo.weight * (pos.x + dx),
      pos.y + varInfo.weight * (pos.y + dy),
    )
  },
  'general',
)
