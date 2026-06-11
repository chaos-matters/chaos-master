import { f32, struct, vec2f } from 'typegpu/data'
import { floor, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ShredlinVarParams = struct({
  xdistance: f32,
  xwidth: f32,
  ydistance: f32,
  ywidth: f32,
})

type ShredlinVarParams = Infer<typeof ShredlinVarParams>

const ShredlinVarParamsDefaults: ShredlinVarParams = {
  xdistance: 1.0,
  xwidth: 0.5,
  ydistance: 1.0,
  ywidth: 0.5,
}

const ShredlinVarParamsEditor: EditorFor<ShredlinVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(
        props,
        'xdistance',
        'X Distance',
        props.dataParameterPath,
      )}
      min={0.1}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xwidth', 'X Width', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(
        props,
        'ydistance',
        'Y Distance',
        props.dataParameterPath,
      )}
      min={0.1}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ywidth', 'Y Width', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
  </>
)

export const shredlinVar = parametricVariation(
  'shredlinVar',
  ShredlinVarParams,
  ShredlinVarParamsDefaults,
  ShredlinVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const xpos = select(f32(0.0), f32(1.0), pos.x < 0.0)
    const ypos = select(f32(0.0), f32(1.0), pos.y < 0.0)
    const xrng = pos.x / P.xdistance
    const yrng = pos.y / P.ydistance
    const newX =
      ((xrng - floor(xrng)) * P.xwidth +
        floor(xrng) +
        (0.5 - xpos) * (1.0 - P.xwidth)) *
      P.xdistance
    const newY =
      ((yrng - floor(yrng)) * P.ywidth +
        floor(yrng) +
        (0.5 - ypos) * (1.0 - P.ywidth)) *
      P.ydistance

    return vec2f(newX, newY).mul(varInfo.weight)
  },
  'general',
)
