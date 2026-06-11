import { f32, struct, vec2f } from 'typegpu/data'
import { ceil, cos, floor, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type TileHlpVarParams = Infer<typeof TileHlpVarParams>
const TileHlpVarParams = struct({
  width: f32,
})

const TileHlpVarParamsDefaults: TileHlpVarParams = {
  width: 1.0,
}

const TileHlpVarParamsEditor: EditorFor<TileHlpVarParams> = (props) => (
  <RangeEditor
    {...editorProps(props, 'width', 'Width')}
    min={0.1}
    max={5.0}
    step={0.01}
  />
)

export const tileHlpVar = parametricVariation(
  'tileHlpVar',
  TileHlpVarParams,
  TileHlpVarParamsDefaults,
  TileHlpVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const width2 = P.width * varInfo.weight
    const x = pos.x / P.width
    let aux = f32(0.0)
    if (x > 0.0) {
      aux = x - floor(x)
    } else {
      aux = x + ceil(x)
    }
    aux = cos(aux * PI.$)
    let aux2 = f32(0.0)
    if (aux < random() * 2.0 - 1.0) {
      aux2 = select(width2, -width2, x > 0.0)
    }
    return vec2f(
      pos.x + varInfo.weight * pos.x + aux2,
      pos.y + varInfo.weight * pos.y,
    )
  },
  'general',
)
