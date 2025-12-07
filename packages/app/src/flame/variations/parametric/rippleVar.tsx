import { f32, struct, vec2f } from 'typegpu/data'
import { cos, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const RippleVarParams = struct({
  frequency: f32,
  velocity: f32,
  amplitude: f32,
  centerx: f32,
  centery: f32,
  phase: f32,
  scale: f32,
  fixed_dist_calc: f32,
})

type RippleVarParams = Infer<typeof RippleVarParams>

const RippleVarParamsDefaults: RippleVarParams = {
  frequency: 2.0,
  velocity: 1.0,
  amplitude: 0.5,
  centerx: 0.0,
  centery: 0.0,
  phase: 0.0,
  scale: 1.0,
  fixed_dist_calc: 0,
}

const RippleVarParamsEditor: EditorFor<RippleVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'frequency', 'Frequency')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'velocity', 'Velocity')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'amplitude', 'Amplitude')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'centerx', 'Center X')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'centery', 'Center Y')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'phase', 'Phase')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'fixed_dist_calc', 'Fixed Dist Calc')}
      min={0}
      max={1}
      step={1}
    />
  </>
)

export const rippleVar = parametricVariation(
  'rippleVar',
  RippleVarParams,
  RippleVarParamsDefaults,
  RippleVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'

    // Init Logic
    const _f = P.frequency * 5.0
    const a = P.amplitude * 0.01
    const PI_VAL = PI.$
    const _p = P.phase * (2.0 * PI_VAL) - PI_VAL

    // scale must not be zero
    const _s = select(P.scale, EPS.$, P.scale === 0.0)
    const _is = 1.0 / _s

    const _vxp = P.velocity * _p
    const _pxa = _p * a
    const _pixa = (PI_VAL - _p) * a
    const _fixed_dist_calc = P.fixed_dist_calc > 0.5 // Treat as boolean

    // Transform Logic
    const x = pos.x * _s - P.centerx
    const y = pos.y * _s + P.centery

    let d = f32(0.0)
    if (_fixed_dist_calc) {
      d = sqrt(x * x + y * y)
    } else {
      d = sqrt(x * x * y * y)
    }

    if (d < EPS.$) d = EPS.$

    const nx = x / d
    const ny = y / d

    const wave = cos(_f * d - _vxp)
    const d1 = wave * _pxa + d
    const d2 = wave * _pixa + d

    const u1 = P.centerx + nx * d1
    const v1 = -P.centery + ny * d1
    const u2 = P.centerx + nx * d2
    const v2 = -P.centery + ny * d2

    // lerp(u1, u2, _p) -> u1 + (u2 - u1) * _p
    const lerpX = u1 + (u2 - u1) * _p
    const lerpY = v1 + (v2 - v1) * _p

    const newX = lerpX * _is
    const newY = lerpY * _is

    return vec2f(newX, newY)
  },
)
