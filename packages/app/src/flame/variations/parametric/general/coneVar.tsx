import { f32, i32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ConeVarParams = struct({
  radius1: f32,
  radius2: f32,
  size1: f32,
  size2: f32,
  ywave: f32,
  xwave: f32,
  height: f32,
  warp: f32,
  weight: f32,
})
type ConeVarParams = Infer<typeof ConeVarParams>
const ConeVarDefaults: ConeVarParams = {
  radius1: 0.5,
  radius2: 1.0,
  size1: 0.5,
  size2: 2.0,
  ywave: 1.0,
  xwave: 1.0,
  height: 1.0,
  warp: 1.0,
  weight: 2.0,
}
const ConeVarEditor: EditorFor<ConeVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius1', 'Radius 1')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'radius2', 'Radius 2')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'size1', 'Size 1')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'size2', 'Size 2')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ywave', 'Y Wave')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xwave', 'X Wave')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'height', 'Height')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'warp', 'Warp')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'weight', 'Weight')}
      min={0}
      max={10}
      step={0.01}
    />
  </>
)
export const coneVar = parametricVariation(
  'coneVar',
  ConeVarParams,
  ConeVarDefaults,
  ConeVarEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r =
      (varInfo.weight /
        sqrt(pos.x * pos.x * P.warp + pos.y * pos.y + P.size1)) *
      P.size2
    const phi = atan2(pos.y, pos.x)
    const rndInt = f32(i32(P.weight * random())) * PI.$ * P.radius2
    const xx = phi * P.radius1 + rndInt
    const sina = sin(xx * P.ywave)
    const cosa = cos(xx * P.xwave)
    return vec2f(r * cosa, r * sina)
  },
  'general',
)
