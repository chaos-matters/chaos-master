import { f32, struct, vec2f } from 'typegpu/data'
import { max, select, sign, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PlusRecipVarParams = struct({
  ar: f32,
  ai: f32,
})

type PlusRecipVarParams = Infer<typeof PlusRecipVarParams>

const PlusRecipVarParamsDefaults: PlusRecipVarParams = {
  ar: 4.0,
  ai: 0.0,
}

const PlusRecipVarParamsEditor: EditorFor<PlusRecipVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'ar', 'Real', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ai', 'Imag', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
  </>
)

export const plusRecipVar = parametricVariation(
  'plusRecipVar',
  PlusRecipVarParams,
  PlusRecipVarParamsDefaults,
  PlusRecipVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const zRe = pos.x
    const zIm = pos.y
    let kRe = pos.x
    let kIm = pos.y
    const aRe = P.ar
    const aIm = P.ai

    const aa = max(sqrt(aRe * aRe + aIm * aIm), EPS.$)

    // k = k^2
    const kSqRe = kRe * kRe - kIm * kIm
    const kSqIm = 2.0 * kRe * kIm
    kRe = kSqRe
    kIm = kSqIm

    // k = k - a
    kRe = kRe - aRe
    kIm = kIm - aIm

    // k = sqrt(k) — complex square root
    const origKRe_s = kRe
    const origKIm_s = kIm
    const rMod_s = sqrt(origKRe_s * origKRe_s + origKIm_s * origKIm_s)
    kRe = sqrt(max((rMod_s + origKRe_s) * 0.5, 0.0))
    kIm = sign(origKIm_s) * sqrt(max((rMod_s - origKRe_s) * 0.5, 0.0))

    // k = k + z
    kRe = kRe + zRe
    kIm = kIm + zIm

    // z = k^2
    const zSqRe = kRe * kRe - kIm * kIm
    const zSqIm = 2.0 * kRe * kIm

    const zMag = sqrt(zSqRe * zSqRe + zSqIm * zSqIm)
    const cond = zMag < aa

    // If cond: conjugate(k) * a * (-1/aa), else: k unchanged
    const invAA = -1.0 / aa
    const scaleRe = aRe * invAA
    const scaleIm = aIm * invAA
    const conjIm = -kIm
    const condKRe = kRe * scaleRe - conjIm * scaleIm
    const condKIm = kRe * scaleIm + conjIm * scaleRe
    kRe = select(kRe, condKRe, cond)
    kIm = select(kIm, condKIm, cond)

    // If kRe < 0, negate k
    const negK = kRe < 0.0
    kRe = select(kRe, -kRe, negK)
    kIm = select(kIm, -kIm, negK)

    return vec2f(kRe, kIm).mul(varInfo.weight)
  },
  'general',
)
