import { f32, struct, vec2f } from 'typegpu/data'
import { asin, cos, floor, sin, sqrt, trunc } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const StarBlurVarParams = struct({
  power: f32,
  range: f32,
})

type StarBlurVarParams = Infer<typeof StarBlurVarParams>

const StarBlurVarParamsDefaults: StarBlurVarParams = {
  power: 5,
  range: 0.40162283,
}

const StarBlurVarParamsEditor: EditorFor<StarBlurVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={1}
      max={50}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'range', 'Range')}
      min={0}
      max={1}
      step={0.01}
    />
  </>
)

export const starBlurVar = parametricVariation(
  'starBlurVar',
  StarBlurVarParams,
  StarBlurVarParamsDefaults,
  StarBlurVarParamsEditor,
  (_pos, _varInfo, P) => {
    'use gpu'
    let starblur_alpha = PI.$ / P.power
    const starblur_length = sqrt(
      1.0 + P.range * P.range - 2.0 * P.range * cos(starblur_alpha),
    )
    starblur_alpha = asin((sin(starblur_alpha) * P.range) / starblur_length)

    let f = random() * P.power * 2.0
    let angle = trunc(f)
    f = f - angle
    const x = f * starblur_length
    let z = sqrt(1 + x * x - 2 * x * cos(starblur_alpha))

    const angleInt = angle
    const isEven = angleInt % 2.0 < 1.0

    if (isEven) {
      const div2 = floor(angleInt / 2.0)
      angle =
        ((2.0 * PI.$) / P.power) * div2 + asin((sin(starblur_alpha) * x) / z)
    } else {
      const div2 = floor(angleInt / 2.0)
      angle =
        ((2.0 * PI.$) / P.power) * div2 - asin((sin(starblur_alpha) * x) / z)
    }

    z = z * sqrt(random())

    const ang = angle - PI.$ * 0.5
    const s = sin(ang)
    const c = cos(ang)

    const newX = z * c
    const newY = z * s

    return vec2f(newX, newY)
  },
)
