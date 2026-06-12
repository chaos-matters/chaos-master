import { f32, struct, vec2f } from 'typegpu/data'
import { abs, pow, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CrobVarParams = struct({
  top: f32,
  bottom: f32,
  left: f32,
  right: f32,
  blur: f32,
  ratioBlur: f32,
  directBlur: f32,
})
type CrobVarParams = Infer<typeof CrobVarParams>
const CrobVarParamsDefaults: CrobVarParams = {
  top: -1.0,
  bottom: 1.0,
  left: -1.0,
  right: 1.0,
  blur: 1.0,
  ratioBlur: 0.05,
  directBlur: 2.0,
}
const CrobVarParamsEditor: EditorFor<CrobVarParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'top', 'Top')} min={-2} max={2} />
    <RangeEditor {...editorProps(props, 'bottom', 'Bottom')} min={-2} max={2} />
    <RangeEditor {...editorProps(props, 'left', 'Left')} min={-2} max={2} />
    <RangeEditor {...editorProps(props, 'right', 'Right')} min={-2} max={2} />
    <RangeEditor
      {...editorProps(props, 'blur', 'Blur')}
      min={0}
      max={1}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'ratioBlur', ' Ratio Blur ')}
      min={0}
      max={1}
    />
    <RangeEditor
      {...editorProps(props, 'directBlur', ' Direct Blur ')}
      min={0}
      max={5}
    />
  </>
)
export const crobVar = parametricVariation(
  'crobVar',
  CrobVarParams,
  CrobVarParamsDefaults,
  CrobVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const t = P.top
    const b = P.bottom
    const l = P.left
    const r = P.right
    const swapTB = t > b
    const real_t = select(t, b, swapTB)
    const real_b = select(b, t, swapTB)
    const swapLR = l > r
    const real_l = select(l, r, swapLR)
    const real_r = select(r, l, swapLR)
    const xInterval = abs(real_r - real_l)
    const yInterval = abs(real_b - real_t)
    const xInt_2 = xInterval * 0.5
    const yInt_2 = yInterval * 0.5
    const minInt_2 = select(xInt_2, yInt_2, yInt_2 < xInt_2)
    const setProb = yInterval / (xInterval + yInterval + 1.0e-9)
    const setProbH = 0.5 * setProb
    const setProbQ = 0.25 * setProb
    const setProbTQ = 0.75 * setProb
    const setCompProb = 1.0 - setProb
    const setCompProbH = setProb + 0.5 * setCompProb
    const setCompProbQ = setProb + 0.25 * setCompProb
    const setCompProbTQ = setProb + 0.75 * setCompProb
    const isBlur = P.blur > 0.5
    const margin = minInt_2 * P.ratioBlur
    const top_b = select(real_t, real_t + margin, isBlur)
    const bot_b = select(real_b, real_b - margin, isBlur)
    const lef_b = select(real_l, real_l + margin, isBlur)
    const rig_b = select(real_r, real_r - margin, isBlur)
    const outside =
      pos.x < lef_b || pos.x > rig_b || pos.y < top_b || pos.y > bot_b
    let dx = pos.x
    let dy = pos.y
    if (outside && isBlur) {
      const secTmp = random()
      const isTopBot = secTmp < setProb
      let tx = pos.x
      let ty = pos.y
      if (isTopBot) {
        ty = real_t + random() * yInt_2
        tx = real_r - pow(random(), P.directBlur) * P.ratioBlur * minInt_2
        if (secTmp < setProbH) tx = real_l + real_r - tx
        if (secTmp > setProbQ && secTmp < setProbTQ) ty = real_b + real_t - ty
      } else {
        tx = real_r - random() * xInt_2
        ty = real_t + pow(random(), P.directBlur) * P.ratioBlur * minInt_2
        if (secTmp > setCompProbH) ty = real_b + real_t - ty
        if (secTmp > setCompProbQ && secTmp < setCompProbTQ)
          tx = real_l + real_r - tx
      }
      dx = tx
      dy = ty
    }
    const finalX = select(pos.x, select(0.0, dx, isBlur), outside)
    const finalY = select(pos.y, select(0.0, dy, isBlur), outside)
    const newX = varInfo.weight * finalX
    const newY = varInfo.weight * finalY
    return vec2f(newX, newY)
  },
  'general',
)
