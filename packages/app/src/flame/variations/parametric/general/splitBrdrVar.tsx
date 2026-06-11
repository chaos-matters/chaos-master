import { f32, struct, vec2f } from 'typegpu/data'
import { abs, round, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SplitBrdrVarParams = struct({
  x: f32,
  y: f32,
  px: f32,
  py: f32,
})

type SplitBrdrVarParams = Infer<typeof SplitBrdrVarParams>

const SplitBrdrVarParamsDefaults: SplitBrdrVarParams = {
  x: 0.25,
  y: 0.25,
  px: 0.0,
  py: 0.0,
}

const SplitBrdrVarParamsEditor: EditorFor<SplitBrdrVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'Border X', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Border Y', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'px', 'Post X', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'py', 'Post Y', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
  </>
)

export const splitBrdrVar = parametricVariation(
  'splitBrdrVar',
  SplitBrdrVarParams,
  SplitBrdrVarParamsDefaults,
  SplitBrdrVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    // Bubble warp
    const B = (pos.x * pos.x + pos.y * pos.y) * 0.25 + 1.0
    const b = 1.0 / B
    let outX = pos.x * b
    let outY = pos.y * b

    // Cell offsets
    const roundX = round(pos.x)
    const roundY = round(pos.y)
    const offsetX = pos.x - roundX
    const offsetY = pos.y - roundY

    const isMain = random() >= 0.75

    // Main branch (75%): mild centering
    const mainX = offsetX * 0.5 + roundX
    const mainY = offsetY * 0.5 + roundY

    // Border branch (25%): push toward cell edges
    const xDom = abs(offsetX) >= abs(offsetY)
    const posOffX = offsetX >= 0.0
    const posOffY = offsetY >= 0.0

    const denomX = select(offsetX, EPS.$, abs(offsetX) < EPS.$)
    const denomY = select(offsetY, EPS.$, abs(offsetY) < EPS.$)

    const borderXN = roundX - P.y
    const borderYN = roundY - (offsetY * P.y) / denomX
    const borderXP = roundX + P.x
    const borderYP = roundY + (offsetY * P.y) / denomX

    const borderXNeg = select(borderXN, borderXP, posOffX)
    const borderYNeg = select(borderYN, borderYP, posOffX)

    const borderYN2 = roundY - P.y
    const borderXN2 = roundX - (offsetX * P.x) / denomY
    const borderYP2 = roundY + P.y
    const borderXP2 = roundX + (offsetX * P.y) / denomY

    const borderXNeg2 = select(borderXN2, borderXP2, posOffY)
    const borderYNeg2 = select(borderYN2, borderYP2, posOffY)

    const borderX = select(borderXNeg2, borderXNeg, xDom)
    const borderY = select(borderYNeg2, borderYNeg, xDom)

    outX = outX + select(borderX, mainX, isMain)
    outY = outY + select(borderY, mainY, isMain)

    // Linear post-add
    outX = outX + pos.x * P.px
    outY = outY + pos.y * P.py

    return vec2f(outX, outY).mul(varInfo.weight)
  },
  'general',
)
