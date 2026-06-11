import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, floor, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ShreddedVarParams = struct({
  x1: f32,
  x2: f32,
  x3: f32,
  y1: f32,
  y2: f32,
  y3: f32,
  shredType: f32,
  blur: f32,
  xBlur: f32,
  yBlur: f32,
})

type ShreddedVarParams = Infer<typeof ShreddedVarParams>

const ShreddedVarParamsDefaults: ShreddedVarParams = {
  x1: 1.0,
  x2: 3.0,
  x3: 1.0,
  y1: 1.0,
  y2: 3.0,
  y3: 1.0,
  shredType: 0.0,
  blur: 0.0,
  xBlur: 0.1,
  yBlur: 0.1,
}

const ShreddedVarParamsEditor: EditorFor<ShreddedVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x1', 'X1 Freq', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x2', 'X2 Scale', props.dataParameterPath)}
      min={0.1}
      max={20.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x3', 'X3 Amp', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y1', 'Y1 Freq', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y2', 'Y2 Scale', props.dataParameterPath)}
      min={0.1}
      max={20.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y3', 'Y3 Amp', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'shredType', 'Type', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={1.0}
    />
    <RangeEditor
      {...editorProps(props, 'blur', 'Blur', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={1.0}
    />
    <RangeEditor
      {...editorProps(props, 'xBlur', 'X Blur', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'yBlur', 'Y Blur', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={0.01}
    />
  </>
)

export const shreddedVar = parametricVariation(
  'shreddedVar',
  ShreddedVarParams,
  ShreddedVarParamsDefaults,
  ShreddedVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const isType0 = abs(P.shredType) < 0.5
    const isType1 = abs(P.shredType - 1.0) < 0.5
    const isType2 = !isType0 && !isType1
    const hasBlur = abs(P.blur) > 0.5

    const si = sin(P.x1 * floor(P.x2 * pos.x))
    const co = cos(P.x1 * floor(P.x2 * pos.y))
    const siY = sin(P.y1 * floor(P.y2 * pos.x))
    const coY = cos(P.y1 * floor(P.y2 * pos.y))

    const bx = P.xBlur * sin(2.0 * PI.$ * random())
    const by = P.yBlur * sin(2.0 * PI.$ * random())

    // Type 0: x*si*pos.y + x*co*pos.y, y*coY*pos.x + y*siY*pos.x
    const x0 = P.x3 * (si + co) * pos.y
    const y0 = P.y3 * (coY + siY) * pos.x

    // Type 1: x*si*pos.y, y*coY*pos.x
    const x1 = P.x3 * si * pos.y
    const y1 = P.y3 * coY * pos.x

    // Type 2: x*si*pos.x, y*coY*pos.y
    const x2 = P.x3 * si * pos.x
    const y2 = P.y3 * coY * pos.y

    const xBase = select(select(x0, x1, isType1), x2, isType0)
    const yBase = select(select(y0, y1, isType1), y2, isType0)

    // Blur adds random noise scaled by input coordinate
    const xBlur = select(0.0, bx * pos.y, hasBlur && !isType2)
    const xBlur2 = select(0.0, bx * pos.x, hasBlur && isType2)
    const yBlur = select(0.0, by * pos.x, hasBlur && !isType2)
    const yBlur2 = select(0.0, by * pos.y, hasBlur && isType2)

    const xOut = xBase + select(xBlur, xBlur2, isType0)
    const yOut = yBase + select(yBlur, yBlur2, isType0)

    return vec2f(xOut, yOut).mul(varInfo.weight)
  },
  'general',
)
