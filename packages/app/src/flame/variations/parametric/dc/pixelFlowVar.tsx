import { f32, i32, struct, u32, vec2f } from 'typegpu/data'
import { abs, cos, floor, sin } from 'typegpu/std'
import { AngleEditor } from '@/components/Sliders/ParametricEditors/AngleEditor'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

// Faithful port of JWildFire's PixelFlow (org.jwildfire...PixelFlowFunc):
// a block-quantized "flowing pixels" perturbation. The point is nudged a small
// distance `len` along a fixed `angle`, scaled by a per-block magnitude and a
// quartic fade. Two deviations from the Java original, both forced by our
// variation framework:
//   * It returns the flow DELTA only (added to the running sum), so to see it
//     you pair it with `linear` — same as in JWildFire, where it accumulates
//     into pVarTP alongside the other variations.
//   * JWildFire's `r01 = pContext.random()` is a per-iteration random; our
//     variations are pure functions of position with no RNG, so r01 is derived
//     deterministically from a fine sub-block hash. The `enable_dc` direct-color
//     option is dropped (the framework only returns a position, not a color).
const PixelFlowVarParams = struct({
  angle: f32,
  len: f32,
  width: f32,
  seed: f32,
})

type PixelFlowVarParams = Infer<typeof PixelFlowVarParams>

const PixelFlowVarParamsDefaults: PixelFlowVarParams = {
  angle: Math.PI / 2, // 90°, stored in radians for AngleEditor
  len: 0.1,
  width: 200.0,
  seed: 42.0,
}

const PixelFlowVarParamsEditor: EditorFor<PixelFlowVarParams> = (props) => (
  <>
    <AngleEditor
      {...editorProps(props, 'angle', 'Angle', props.dataParameterPath)}
    />
    <RangeEditor
      {...editorProps(props, 'len', 'Length', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'width', 'Width', props.dataParameterPath)}
      min={1.0}
      max={1000.0}
      step={1.0}
    />
    <RangeEditor
      {...editorProps(props, 'seed', 'Seed', props.dataParameterPath)}
      min={0}
      max={100}
      step={1}
    />
  </>
)

// Robert Jenkins' 32-bit integer hash (PixelFlowFunc.hash()). The scramble runs
// in u32 — WGSL requires u32 shift amounts and the bit ops match the Java signed
// version — then the final value is reinterpreted as signed and normalized by
// 2^31-1 (JWildFire's `(double)a / Integer.MAX_VALUE`), so it spans ~[-1, 1).
const pixel_flow_hash = (inVal: number): number => {
  'use gpu'
  let a = u32(inVal)
  a = (a ^ 61) ^ (a >> u32(16))
  a = a + (a << u32(3))
  a = a ^ (a >> u32(4))
  a = a * 0x27d4eb2d
  a = a ^ (a >> u32(15))
  return f32(i32(a)) / 2147483647.0
}

export const pixelFlowVar = parametricVariation(
  'pixelFlowVar',
  PixelFlowVarParams,
  PixelFlowVarParamsDefaults,
  PixelFlowVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const seedI = i32(P.seed)
    // angle is stored in radians (driven by AngleEditor)
    const sina = sin(P.angle)
    const cosa = cos(P.angle)

    let blockx = i32(floor(pos.x * P.width))
    blockx = blockx + i32(2.0 - 4.0 * pixel_flow_hash(blockx * seedI + 1))
    let blocky = i32(floor(pos.y * P.width))
    blocky = blocky + i32(2.0 - 4.0 * pixel_flow_hash(blocky * seedI + 1))

    const fLen =
      (pixel_flow_hash(blocky + blockx * -seedI) +
        pixel_flow_hash(blockx + blocky * (seedI / 2))) *
      0.5

    // Deterministic stand-in for pContext.random(): hash a fine sub-block cell
    // so the quartic fade still varies across the plane. abs() maps to [0, 1).
    const rk =
      i32(floor(pos.x * P.width * 821.0)) * 374761393 +
      i32(floor(pos.y * P.width * 821.0)) * 668265263
    const r01 = abs(pixel_flow_hash(rk))
    const fade = fLen * r01 * r01 * r01 * r01

    return vec2f(P.len * cosa * fade, P.len * sina * fade).mul(varInfo.weight)
  },
  'dc',
)
