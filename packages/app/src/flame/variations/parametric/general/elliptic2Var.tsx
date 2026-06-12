import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, log, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { EPS, PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Elliptic2VarParams = struct({
  a1: f32,
  a2: f32,
  a3: f32,
  b1: f32,
  b2: f32,
  c: f32,
  d: f32,
  e: f32,
  f: f32,
  g: f32,
  h: f32,
})

type Elliptic2VarParams = Infer<typeof Elliptic2VarParams>

const Elliptic2VarParamsDefaults: Elliptic2VarParams = {
  a1: 1.0,
  a2: 1.0,
  a3: 0.0,
  b1: 2.0,
  b2: 1.0,
  c: 0.5,
  d: 1.0,
  e: 0.5,
  f: 1.0,
  g: 1.0,
  h: 2.0,
}

const Elliptic2VarParamsEditor: EditorFor<Elliptic2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a1', 'A1', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'a2', 'A2', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'a3', 'A3', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b1', 'B1', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b2', 'B2', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e', 'E', props.dataParameterPath)}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f', 'F', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'g', 'G', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'h', 'H', props.dataParameterPath)}
      min={0.1}
      max={10}
      step={0.01}
    />
  </>
)

export const elliptic2Var = parametricVariation(
  'elliptic2Var',
  Elliptic2VarParams,
  Elliptic2VarParamsDefaults,
  Elliptic2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const v = P.h / PI.$
    const ps = (-PI.$ / 2.0) * P.a3
    const tmp = pos.y * pos.y + pos.x * pos.x + P.a1
    const x2 = P.b1 * pos.x
    const xmax = P.c * (sqrt(tmp + x2) + sqrt(tmp - x2))
    const xmaxSafe = select(xmax, EPS.$, xmax <= EPS.$)
    const a = (pos.x / xmaxSafe) * P.a2
    const bArg = select(P.d - a * a, f32(0.0), P.d - a * a < f32(0.0))
    const b = sqrt(bArg) * P.b2
    const w = select(varInfo.weight, f32(1.0), abs(varInfo.weight) <= EPS.$)
    const nx = v * atan2(a, b) + ps / w
    const rnd = random()
    const xSub = select(P.f, P.g, rnd < P.e)
    const logArg =
      xmaxSafe +
      sqrt(select(xmaxSafe - xSub, f32(0.0), xmaxSafe - xSub < f32(0.0)))
    const ySign = select(f32(-1.0), f32(1.0), rnd < P.e)
    const logArgSafe = select(logArg, EPS.$, logArg <= EPS.$)
    const ny = ySign * v * log(logArgSafe)
    return vec2f(nx, ny)
  },
  'general',
)
