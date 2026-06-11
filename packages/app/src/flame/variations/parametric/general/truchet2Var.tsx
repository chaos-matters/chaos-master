import { f32, struct, vec2f } from 'typegpu/data'
import { abs, floor, fract, min, pow, round, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Truchet2VarParams = struct({
  exponent1: f32,
  exponent2: f32,
  width1: f32,
  width2: f32,
  scale: f32,
  seed: f32,
  inverse: f32,
})

type Truchet2VarParams = Infer<typeof Truchet2VarParams>

const Truchet2VarParamsDefaults: Truchet2VarParams = {
  exponent1: 1.0,
  exponent2: 1.0,
  width1: 0.5,
  width2: 0.5,
  scale: 5.0,
  seed: 0.0,
  inverse: 0.0,
}

const Truchet2VarParamsEditor: EditorFor<Truchet2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(
        props,
        'exponent1',
        'Exponent 1',
        props.dataParameterPath,
      )}
      min={0.1}
      max={5.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(
        props,
        'exponent2',
        'Exponent 2',
        props.dataParameterPath,
      )}
      min={0.1}
      max={5.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'width1', 'Width 1', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'width2', 'Width 2', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale', props.dataParameterPath)}
      min={1.0}
      max={15.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'seed', 'Seed', props.dataParameterPath)}
      min={0.0}
      max={100.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'inverse', 'Inverse', props.dataParameterPath)}
      min={0}
      max={1}
      step={1}
    />
  </>
)

export const truchet2Var = parametricVariation(
  'truchet2Var',
  Truchet2VarParams,
  Truchet2VarParamsDefaults,
  Truchet2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xp = abs(pos.x / P.scale - floor(pos.x / P.scale) - 0.5) * 2.0
    let width = P.width1 * (1.0 - xp) + xp * P.width2
    width = min(width, 1.0)

    if (width <= 0.0) {
      return vec2f(pos.x, pos.y).mul(varInfo.weight)
    }

    let n = P.exponent1 * (1.0 - xp) + xp * P.exponent2
    n = min(n, 2.0)

    if (n <= 0.0) {
      return vec2f(pos.x, pos.y).mul(varInfo.weight)
    }

    const onen = 1.0 / (P.exponent1 * (1.0 - xp) + xp * P.exponent2)
    const aseed = abs(P.seed)
    const seed2 =
      (sqrt(aseed + aseed / 2.0 + EPS.$) / (aseed * 0.5 + EPS.$)) * 0.25

    const x = fract(pos.x)
    const y = fract(pos.y)

    let tiletype = pos.x
    if (P.seed === 0.0) {
      tiletype = 0.0
    } else if (P.seed === 1.0) {
      tiletype = 1.0
    } else {
      const xrand = round(pos.x) * seed2
      const yrand = round(pos.y) * seed2
      const niter = xrand + yrand + xrand * yrand
      let randint = ((niter + aseed) * seed2) / 2.0
      randint = (randint * 32747.0 + 12345.0) % 65535.0
      tiletype = randint % 2.0
    }

    let r0 = pos.x
    let r1 = pos.y
    if (tiletype < 1.0) {
      r0 = pow(pow(abs(x), n) + pow(abs(y), n), onen)
      r1 = pow(pow(abs(x - 1.0), n) + pow(abs(y - 1.0), n), onen)
    } else {
      r0 = pow(pow(abs(x - 1.0), n) + pow(abs(y), n), onen)
      r1 = pow(pow(abs(x), n) + pow(abs(y - 1.0), n), onen)
    }

    const rmax = 0.5 * (pow(2.0, onen) - 1.0) * width
    const r00 = abs(r0 - 0.5) / rmax
    const r11 = abs(r1 - 0.5) / rmax

    if (P.inverse === 0.0) {
      if (r00 < 1.0 || r11 < 1.0) {
        return vec2f(x + floor(pos.x), y + floor(pos.y)).mul(varInfo.weight)
      }
      return vec2f(100.0, 100.0).mul(varInfo.weight)
    }

    if (r00 > 1.0 && r11 > 1.0) {
      return vec2f(x + floor(pos.x), y + floor(pos.y)).mul(varInfo.weight)
    }
    return vec2f(10000.0, 10000.0).mul(varInfo.weight)
  },
  'general',
)
