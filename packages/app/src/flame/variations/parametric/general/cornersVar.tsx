import { f32, struct, vec2f } from 'typegpu/data'
import { log, pow, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CornersVarParams = struct({
  x: f32,
  y: f32,
  mult_x: f32,
  mult_y: f32,
  x_power: f32,
  y_power: f32,
  xy_power_add: f32,
  log_mode: f32,
  log_base: f32,
})
type CornersVarParams = Infer<typeof CornersVarParams>
const CornersVarDefaults: CornersVarParams = {
  x: 1.0,
  y: 1.0,
  mult_x: 1.0,
  mult_y: 1.0,
  x_power: 0.75,
  y_power: 0.75,
  xy_power_add: 0.0,
  log_mode: 0.0,
  log_base: 2.71828,
}
const CornersVarEditor: EditorFor<CornersVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'X')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'mult_x', 'Mult X')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'mult_y', 'Mult Y')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x_power', 'X Power')}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y_power', 'Y Power')}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xy_power_add', 'XY Power Add')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'log_mode', 'Log Mode')}
      min={0}
      max={2}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'log_base', 'Log Base')}
      min={1.5}
      max={5}
      step={0.01}
    />
  </>
)
export const cornersVar = parametricVariation(
  'cornersVar',
  CornersVarParams,
  CornersVarDefaults,
  CornersVarEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xs = pos.x * pos.x
    const ys = pos.y * pos.y
    const isLogMode = P.log_mode !== 0.0
    const ex = select(
      pow(xs, P.x_power + P.xy_power_add) * P.mult_x,
      pow(
        log(xs * P.mult_x + 3.0) / log(P.log_base),
        P.x_power + 2.25 + P.xy_power_add,
      ) - 1.33,
      isLogMode,
    )
    const ey = select(
      pow(ys, P.y_power + P.xy_power_add) * P.mult_y,
      pow(
        log(ys * P.mult_y + 3.0) / log(P.log_base),
        P.y_power + 2.25 + P.xy_power_add,
      ) - 1.33,
      isLogMode,
    )
    const newX = select(
      varInfo.weight * -ex - P.x,
      varInfo.weight * ex + P.x,
      pos.x > 0.0,
    )
    const newY = select(
      varInfo.weight * -ey - P.y,
      varInfo.weight * ey + P.y,
      pos.y > 0.0,
    )
    return vec2f(newX, newY)
  },
  'general',
)
