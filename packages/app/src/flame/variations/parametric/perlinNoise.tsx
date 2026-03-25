import { perlin2d } from '@typegpu/noise'
import { f32, i32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PerlinNoiseVarParams = struct({
  octaves: i32,
  persistance: f32,
  lacunarity: f32,
})

type PerlinNoiseVarParams = Infer<typeof PerlinNoiseVarParams>

const PerlinNoiseVarParamsDefaults: PerlinNoiseVarParams = {
  octaves: 8,
  persistance: 0.4,
  lacunarity: 2.4,
}

const PerlinNoiseVarParamsEditor: EditorFor<PerlinNoiseVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'persistance', 'Persistance')}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'lacunarity', 'Lacunarity')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'octaves', 'Octaves')}
      min={1}
      max={15}
      step={1}
    />
  </>
)

export const perlinNoiseVar = parametricVariation(
  'perlinNoiseVar',
  PerlinNoiseVarParams,
  PerlinNoiseVarParamsDefaults,
  PerlinNoiseVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    let total = f32(0)
    let maxValue = f32(0)
    let freq = f32(1)
    let amplitude = f32(1)
    const lacunarity = P.lacunarity
    const persistence = P.persistance

    for (let i = 0; i < P.octaves; i++) {
      total += perlin2d.sample(pos.mul(freq)) * amplitude

      maxValue += amplitude

      freq *= lacunarity
      amplitude *= persistence
    }

    return vec2f(pos).add(total / maxValue)
  },
)
