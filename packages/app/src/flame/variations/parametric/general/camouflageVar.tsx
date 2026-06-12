import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CamouflageVarParams = struct({
  scale: f32,
  angle: f32,
  lacunarity: f32,
})
type CamouflageVarParams = Infer<typeof CamouflageVarParams>
const CamouflageVarParamsDefaults: CamouflageVarParams = {
  scale: 1.0,
  angle: 0.0,
  lacunarity: 2.0,
}
const CamouflageVarParamsEditor: EditorFor<CamouflageVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle')}
      min={0}
      max={360}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'lacunarity', 'Lacunarity')}
      min={0}
      max={5}
      step={0.01}
    />
  </>
)
export const camouflageVar = parametricVariation(
  'camouflageVar',
  CamouflageVarParams,
  CamouflageVarParamsDefaults,
  CamouflageVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const ang = (P.angle * PI.$) / 180.0
    const s = sin(ang)
    const c = cos(ang)
    const nx = pos.x * P.scale
    const ny = pos.y * P.scale
    const jitter = (random() - 0.5) * 0.1 // Placeholder noise
    const rx = nx * c - ny * s + jitter
    const ry = nx * s + ny * c + jitter
    const newX = varInfo.weight * rx
    const newY = varInfo.weight * ry
    return vec2f(newX, newY)
  },
  'general',
)
