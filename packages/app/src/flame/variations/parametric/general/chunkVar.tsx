import { f32, struct, vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ChunkVarParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  e: f32,
  f: f32,
  mode: f32,
})

type ChunkVarParams = Infer<typeof ChunkVarParams>

const ChunkVarParamsDefaults: ChunkVarParams = {
  a: 1.0,
  b: 0.0,
  c: 1.0,
  d: 0.0,
  e: 0.0,
  f: -1.0,
  mode: 0.0,
}

const ChunkVarParamsEditor: EditorFor<ChunkVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e', 'E', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f', 'F', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'mode', 'Mode', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={1.0}
    />
  </>
)

export const chunkVar = parametricVariation(
  'chunkVar',
  ChunkVarParams,
  ChunkVarParamsDefaults,
  ChunkVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r =
      P.a * pos.x * pos.x +
      P.b * pos.x * pos.y +
      P.c * pos.y * pos.y +
      P.d * pos.x +
      P.e * pos.y +
      P.f
    const mode0 = r <= 0.0
    const mode1 = r > 0.0
    const passThrough = select(mode0, mode1, P.mode > 0.5)
    return select(vec2f(0.0, 0.0), pos, passThrough).mul(varInfo.weight)
  },
  'general',
)
