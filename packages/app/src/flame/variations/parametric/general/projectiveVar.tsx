import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type ProjectiveVarParams = Infer<typeof ProjectiveVarParams>
const ProjectiveVarParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  e: f32,
  f: f32,
  g: f32,
  h: f32,
})

const ProjectiveVarParamsDefaults: ProjectiveVarParams = {
  a: 1.0,
  b: 0.0,
  c: 0.0,
  d: 0.0,
  e: 1.0,
  f: 0.0,
  g: 0.0,
  h: 0.0,
}

const ProjectiveVarParamsEditor: EditorFor<ProjectiveVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e', 'E')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f', 'F')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'g', 'G')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'h', 'H')}
      min={-1}
      max={1}
      step={0.01}
    />
  </>
)

export const projectiveVar = parametricVariation(
  'projectiveVar',
  ProjectiveVarParams,
  ProjectiveVarParamsDefaults,
  ProjectiveVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const denom = P.g * x + P.h * y + 1.0
    const nx = (P.a * x + P.b * y + P.c) / denom
    const ny = (P.d * x + P.e * y + P.f) / denom
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
