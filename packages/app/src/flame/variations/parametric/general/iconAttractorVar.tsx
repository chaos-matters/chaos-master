import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type IconAttractorParams = Infer<typeof IconAttractorParams>
const IconAttractorParams = struct({
  degree: f32,
  a: f32,
  b: f32,
  g: f32,
  o: f32,
  l: f32,
})

const IconAttractorDefaults: IconAttractorParams = {
  degree: 5.0,
  a: 5.0,
  b: -1.9,
  g: 1.0,
  o: 0.188,
  l: -2.5,
}

const IconAttractorEditor: EditorFor<IconAttractorParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'degree', 'Degree')}
      min={3}
      max={50}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={-20}
      max={20}
      step={0.001}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={-20}
      max={20}
      step={0.001}
    />
    <RangeEditor
      {...editorProps(props, 'g', 'G')}
      min={-5}
      max={5}
      step={0.001}
    />
    <RangeEditor
      {...editorProps(props, 'o', 'O')}
      min={-5}
      max={5}
      step={0.001}
    />
    <RangeEditor
      {...editorProps(props, 'l', 'L')}
      min={-5}
      max={5}
      step={0.001}
    />
  </>
)

export const iconAttractorVar = parametricVariation(
  'iconAttractorVar',
  IconAttractorParams,
  IconAttractorDefaults,
  IconAttractorEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const zzbar = pos.x * pos.x + pos.y * pos.y
    let p = P.a * zzbar + P.l
    let zreal = pos.x
    let zimag = pos.y
    for (let i = f32(1.0); i <= P.degree - 2.0; i += 1.0) {
      const za = zreal * pos.x - zimag * pos.y
      const zb = zimag * pos.x + zreal * pos.y
      zreal = za
      zimag = zb
    }
    const zn = pos.x * zreal - pos.y * zimag
    p = p + P.b * zn
    const x = p * pos.x + P.g * zreal - P.o * pos.y
    const y = p * pos.y - P.g * zimag + P.o * pos.x
    return vec2f(x, y).mul(varInfo.weight)
  },
  'general',
)
