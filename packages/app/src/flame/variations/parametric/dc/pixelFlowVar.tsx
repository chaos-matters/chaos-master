import { f32, i32, struct, u32, vec2f } from 'typegpu/data'
import { clamp, cos, floor, fract, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PixelFlowVarParams = struct({
  scale_x: f32,
  scale_y: f32,
  speed_x: f32,
  speed_y: f32,
  seed: f32,
})

type PixelFlowVarParams = Infer<typeof PixelFlowVarParams>

const PixelFlowVarParamsDefaults: PixelFlowVarParams = {
  scale_x: 1.0,
  scale_y: 1.0,
  speed_x: 1.0,
  speed_y: 1.0,
  seed: 0.0,
}

const PixelFlowVarParamsEditor: EditorFor<PixelFlowVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scale_x', 'Scale X', props.dataParameterPath)}
      min={0.1}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scale_y', 'Scale Y', props.dataParameterPath)}
      min={0.1}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'speed_x', 'Speed X', props.dataParameterPath)}
      min={0.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'speed_y', 'Speed Y', props.dataParameterPath)}
      min={0.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'seed', 'Seed', props.dataParameterPath)}
      min={0}
      max={100}
      step={1}
    />
  </>
)

const pixel_flow_hash = (inVal: number): number => {
  'use gpu'
  let a = u32(inVal)
  a = a ^ 61 ^ (a >> u32(16))
  a = a + (a << u32(3))
  a = a ^ (a >> u32(4))
  a = a * 0x27d4eb2d
  a = a ^ (a >> u32(15))
  // GPU code divides by exp2f(32.0) => 2^32
  return f32(a) / 4294967296.0
}

export const pixelFlowVar = parametricVariation(
  'pixelFlowVar',
  PixelFlowVarParams,
  PixelFlowVarParamsDefaults,
  PixelFlowVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const scaled_x = pos.x * P.scale_x
    const scaled_y = pos.y * P.scale_y
    const fx = floor(scaled_x)
    const fy = floor(scaled_y)
    const rx = fract(scaled_x)
    const ry = fract(scaled_y)
    const n = f32(pixel_flow_hash(i32(fx + fy * 57.0 + P.seed)))
    const angle = n * 6.283185307

    const cos_a = cos(angle)
    const sin_a = sin(angle)
    const flow_x = rx - 0.5 + cos_a * P.speed_x
    const flow_y = ry - 0.5 + sin_a * P.speed_y

    return vec2f(
      (fx + clamp(flow_x, 0.0, 1.0)) / P.scale_x,
      (fy + clamp(flow_y, 0.0, 1.0)) / P.scale_y,
    ).mul(varInfo.weight)
  },
  'dc',
)
