import { f32, struct, vec2f } from 'typegpu/data'
import { log, round, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const IntersectionVarParams = struct({
  xwidth: f32,
  xtilesize: f32,
  xmod1: f32,
  xmod2: f32,
  xheight: f32,
  yheight: f32,
  ytilesize: f32,
  ymod1: f32,
  ymod2: f32,
  ywidth: f32,
})

type IntersectionVarParams = Infer<typeof IntersectionVarParams>

const IntersectionVarParamsDefaults: IntersectionVarParams = {
  xwidth: 5.0,
  xtilesize: 0.5,
  xmod1: 0.3,
  xmod2: 1.0,
  xheight: 0.5,
  yheight: 5.0,
  ytilesize: 0.5,
  ymod1: 0.3,
  ymod2: 1.0,
  ywidth: 0.5,
}

const IntersectionVarParamsEditor: EditorFor<IntersectionVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'xwidth', 'X Width', props.dataParameterPath)}
      min={0.1}
      max={20.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(
        props,
        'xtilesize',
        'X Tile Size',
        props.dataParameterPath,
      )}
      min={0.01}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xmod1', 'X Mod1', props.dataParameterPath)}
      min={0.01}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xmod2', 'X Mod2', props.dataParameterPath)}
      min={0.01}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xheight', 'X Height', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'yheight', 'Y Height', props.dataParameterPath)}
      min={0.1}
      max={20.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(
        props,
        'ytilesize',
        'Y Tile Size',
        props.dataParameterPath,
      )}
      min={0.01}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ymod1', 'Y Mod1', props.dataParameterPath)}
      min={0.01}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ymod2', 'Y Mod2', props.dataParameterPath)}
      min={0.01}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ywidth', 'Y Width', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
  </>
)

export const intersectionVar = parametricVariation(
  'intersectionVar',
  IntersectionVarParams,
  IntersectionVarParamsDefaults,
  IntersectionVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const xr1 = P.xmod2 * P.xmod1
    const yr1 = P.ymod2 * P.ymod1

    const coinFlip = random() < 0.5

    // X branch
    const x_sign = select(P.xwidth, -P.xwidth, random() < 0.5)
    const xOut = P.xtilesize * (pos.x + round(x_sign * log(random() + EPS.$)))
    const yOutX = select(
      select(
        P.xheight * (-P.xmod1 + ((pos.y + P.xmod1) % xr1)),
        P.xheight * (P.xmod1 - ((P.xmod1 - pos.y) % xr1)),
        pos.y < -P.xmod1,
      ),
      P.xheight * pos.y,
      pos.y > P.xmod1 || pos.y < -P.xmod1,
    )

    // Y branch
    const y_sign = select(P.yheight, -P.yheight, random() < 0.5)
    const yOut = P.ytilesize * (pos.y + round(y_sign * log(random() + EPS.$)))
    const xOutY = select(
      select(
        P.ywidth * (-P.ymod1 + ((pos.x + P.ymod1) % yr1)),
        P.ywidth * (P.ymod1 - ((P.ymod1 - pos.x) % yr1)),
        pos.x < -P.ymod1,
      ),
      P.ywidth * pos.x,
      pos.x > P.ymod1 || pos.x < -P.ymod1,
    )

    const xFinal = select(xOut, xOutY, coinFlip)
    const yFinal = select(yOutX, yOut, coinFlip)

    return vec2f(xFinal, yFinal).mul(varInfo.weight)
  },
  'general',
)
