import { f32, i32, struct, u32, vec2f } from 'typegpu/data'
import { cos, floor, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PixelFlowVarParams = struct({
  angle: f32,
  len: f32,
  width: f32,
  seed: f32,
  enableDirectColor: f32,
})

type PixelFlowVarParams = Infer<typeof PixelFlowVarParams>

const PixelFlowVarParamsDefaults: PixelFlowVarParams = {
  angle: 90.0,
  len: 0.1,
  width: 200.0,
  seed: 42.0,
  enableDirectColor: 0.0,
}

const PixelFlowVarParamsEditor: EditorFor<PixelFlowVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle')}
      min={0}
      max={360}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'len', 'Length')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'width', 'Width')}
      min={1}
      max={500}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'seed', 'Seed')}
      min={0}
      max={100000}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'enableDirectColor', 'Enable Direct Color')}
      min={0}
      max={1}
      step={1}
    />
  </>
)

const pixel_flow_hash = (inVal: number): number => {
  'use gpu'
  let a = u32(inVal)
  a = a ^ 61 ^ (a >> 16)
  a = a + (a << 3)
  a = a ^ (a >> 4)
  a = a * 0x27d4eb2d
  a = a ^ (a >> 15)
  // GPU code divides by exp2f(32.0) => 2^32
  return f32(a) / 4294967296.0
}

export const pixelFlowVar = parametricVariation(
  'pixelFlowVar',
  PixelFlowVarParams,
  PixelFlowVarParamsDefaults,
  PixelFlowVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    // deg to rad
    const a_rad = P.angle * 0.0174532925
    const sina = sin(a_rad)
    const cosa = cos(a_rad)

    const seed_i = i32(P.seed)

    // Block X
    let blockx = i32(floor(pos.x * P.width))
    let hashVal = pixel_flow_hash(blockx * seed_i + 1)
    blockx += i32(2.0 - 4.0 * hashVal)

    // Block Y
    let blocky = i32(floor(pos.y * P.width))
    hashVal = pixel_flow_hash(blocky * seed_i + 1)
    blocky += i32(2.0 - 4.0 * hashVal)

    // fLen
    const h1 = pixel_flow_hash(blocky + blockx * -seed_i)
    const h2 = pixel_flow_hash(blockx + i32(f32(blocky * seed_i) / 2.0))
    const fLen = (h1 + h2) * 0.5

    const r01 = random()
    const fade = fLen * r01 * r01 * r01 * r01

    const newX = P.len * cosa * fade
    const newY = P.len * sina * fade

    return vec2f(newX, newY)
  },
)
