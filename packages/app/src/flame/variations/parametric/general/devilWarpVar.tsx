import { f32, struct, vec2f } from 'typegpu/data'
import { abs, pow, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const DevilWarpVarParams = struct({
  a: f32,
  b: f32,
  effect: f32,
  warp: f32,
  rmin: f32,
  rmax: f32,
})

type DevilWarpVarParams = Infer<typeof DevilWarpVarParams>

const DevilWarpVarParamsDefaults: DevilWarpVarParams = {
  a: 2.0,
  b: 1.0,
  effect: 1.0,
  warp: 0.5,
  rmin: -0.24,
  rmax: 100.0,
}

const DevilWarpVarParamsEditor: EditorFor<DevilWarpVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={-10}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B', props.dataParameterPath)}
      min={-10}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'effect', 'Effect', props.dataParameterPath)}
      min={0}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'warp', 'Warp', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'rmin', 'R Min', props.dataParameterPath)}
      min={-10}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'rmax', 'R Max', props.dataParameterPath)}
      min={0}
      max={200}
      step={1}
    />
  </>
)

export const devilWarpVar = parametricVariation(
  'devilWarpVar',
  DevilWarpVarParams,
  DevilWarpVarParamsDefaults,
  DevilWarpVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y

    const x2 = x * x
    const y2 = y * y
    const r2 = 1.0 / (x2 + y2 + EPS.$)
    const r = pow(x2 + r2 * P.b * y2, P.warp) - pow(y2 + r2 * P.a * x2, P.warp)

    let rr = abs(r)
    rr = select(rr, P.rmin, rr < P.rmin)
    rr = select(rr, P.rmax, rr > P.rmax)

    const effect = P.effect * rr

    return vec2f(pos.x + x * effect, pos.y + y * effect).mul(varInfo.weight)
  },
  'general',
)
