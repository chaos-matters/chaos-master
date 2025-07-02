import { produce, unfreeze } from 'structurajs'
import { defineExample } from '../examples/util'
import { generateTransformId, generateVariationId } from '../transformFunction'
import { isParametricVariationType, transformVariations } from '.'
import type { FlameDescriptor } from '../schema/flameSchema'
import type {
  ParametricVariationDescriptor,
  TransformVariationDescriptor,
  TransformVariationType,
} from '.'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export function getVariationDefault(
  type: TransformVariationType,
  weight: number,
): TransformVariationDescriptor {
  if (!isParametricVariationType(type)) {
    return { type, weight } as TransformVariationDescriptor
  }
  return {
    type,
    params: transformVariations[type].paramDefaults,
    weight,
  } as TransformVariationDescriptor
}

export function getParamsEditor<T extends ParametricVariationDescriptor>(
  variation: T,
): { component: EditorFor<T['params']>; value: T['params'] } {
  return {
    component: transformVariations[variation.type].editor as EditorFor<
      T['params']
    >,
    get value() {
      return variation.params
    },
  }
}
export const transformPreviewId = generateTransformId()
export const variationPreviewId = generateVariationId()

function getDefaultFlameByVarType(
  type: TransformVariationType,
): FlameDescriptor {
  return defineExample({
    renderSettings: {
      exposure: 0.3,
      skipIters: 1,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      camera: {
        zoom: 1,
        position: [0, 0],
      },
      colorInitMode: 'colorInitPosition',
    },
    transforms: {
      [transformPreviewId]: {
        probability: 1,
        preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0, y: 0 },
        variations: {
          [variationPreviewId]: getVariationDefault(type, 1.0),
        },
      },
    },
  })
}

const previewFlames: Partial<Record<TransformVariationType, FlameDescriptor>> =
  {
    horseshoe: unfreeze(
      produce(getDefaultFlameByVarType('horseshoe'), (draft) => {
        draft.transforms[transformPreviewId]!.preAffine = {
          c: 0.4489954195606869,
          f: -0.4301584776979597,
          a: -0.6331653685349898,
          b: -0.6087500485024285,
          d: -1.0517990037014098,
          e: -0.4865003428489606,
        }
      }),
    ) as FlameDescriptor,
    crossVar: unfreeze(
      produce(getDefaultFlameByVarType('crossVar'), (draft) => {
        draft.transforms[transformPreviewId]!.preAffine = {
          c: -0.018140589569160814,
          f: 0.018140589569160953,
          a: 2.001308488559136,
          b: -0.009967503645097698,
          d: 0.0274246123309187,
          e: 1.955389021287148,
        }
      }),
    ),
    cylinder: unfreeze(
      produce(getDefaultFlameByVarType('cylinder'), (draft) => {
        draft.renderSettings.exposure = 0.666
        draft.renderSettings.camera = {
          zoom: 0.3493516243061941,
          position: [0.20715316352406743, -0.16595190682220834],
        }
        draft.transforms[transformPreviewId]!.preAffine = {
          c: -0.013468013468013407,
          f: 0,
          a: 2.6554162592699293,
          b: -2.2134740265402675,
          d: 1.6229514134593572,
          e: 1.8246557550917812,
        }
      }),
    ),
    diamond: unfreeze(
      produce(getDefaultFlameByVarType('diamond'), (draft) => {
        draft.transforms[transformPreviewId]!.preAffine = {
          c: 0,
          f: 0,
          a: 0.5752348183753919,
          b: 4.552930872842858,
          d: 3.306719089367465,
          e: -0.28255288522493477,
        }
      }),
    ),
    fan: unfreeze(
      produce(getDefaultFlameByVarType('fan'), (draft) => {
        draft.transforms[transformPreviewId]!.preAffine = {
          c: 0.3030303030303029,
          f: 0.35151515151515156,
          a: 0.6931111689557807,
          b: 0.04304811234031391,
          d: 0.04827625346378865,
          e: 0.7132582839731785,
        }
      }),
    ),
    waves: unfreeze(
      produce(getDefaultFlameByVarType('waves'), (draft) => {
        draft.transforms[transformPreviewId]!.preAffine = {
          c: -0.3636010248255146,
          f: -0.22892481667991876,
          a: 1.2052888138611,
          b: -0.2773087299704806,
          d: 0.38927695930481726,
          e: 1.149919974554039,
        }
      }),
    ),
    ngonVar: unfreeze(
      produce(getDefaultFlameByVarType('ngonVar'), (draft) => {
        draft.transforms[transformPreviewId]!.preAffine = {
          c: -0.01212121212121231,
          f: -0.06060606060606066,
          a: 1.2940090947979932,
          b: -0.2008651636171157,
          d: 0.37721466299031076,
          e: 1.294204089963071,
        }
        draft.transforms[transformPreviewId]!.variations[variationPreviewId] = {
          type: 'ngonVar',
          weight: 1.0,
          params: {
            power: 2,
            sides: 6,
            corners: 2,
            circle: 0,
          },
        }
      }),
    ),
    popcorn: unfreeze(
      produce(getDefaultFlameByVarType('popcorn'), (draft) => {
        draft.transforms[transformPreviewId]!.preAffine = {
          a: 1,
          b: 0,
          c: -0.28224055579678675,
          d: 0,
          e: 1,
          f: -0.39079461571862784,
        }
      }),
    ),
    rings: unfreeze(
      produce(getDefaultFlameByVarType('rings'), (draft) => {
        draft.transforms[transformPreviewId]!.preAffine = {
          c: 0.24772547468354453,
          f: 0.00009889240506325003,
          a: 1.0043677286151427,
          b: -0.0060604774570230694,
          d: 0.0060604774570230694,
          e: 1.0043677286151427,
        }
      }),
    ),
    rectanglesVar: unfreeze(
      produce(getDefaultFlameByVarType('rectanglesVar'), (draft) => {
        draft.renderSettings.exposure = 0.494
        draft.transforms[transformPreviewId]!.variations[variationPreviewId] = {
          type: 'rectanglesVar',
          weight: 1.0,
          params: {
            x: 1,
            y: 1,
          },
        }
      }),
    ),
    rings2: unfreeze(
      produce(getDefaultFlameByVarType('rings2'), (draft) => {
        draft.renderSettings.exposure = 0.552
        draft.transforms[transformPreviewId]!.preAffine = {
          c: 0.05976331360946743,
          f: -0.1600838264299801,
          a: 1.6440360757046795,
          b: 1.8433469574444175,
          d: 1.7823436569258906,
          e: -0.5000425830694895,
        }
        draft.transforms[transformPreviewId]!.variations[variationPreviewId] = {
          type: 'rings2',
          weight: 1.0,
          params: {
            val: 1.2,
          },
        }
      }),
    ),
    secantVar: unfreeze(
      produce(getDefaultFlameByVarType('secantVar'), (draft) => {
        draft.renderSettings.exposure = 0.945
        draft.renderSettings.camera.zoom = 0.4232988892907777
        draft.renderSettings.camera.position = [
          0.22031681118067803, 0.18394228752956718,
        ]
        draft.transforms[transformPreviewId]!.preAffine = {
          a: 2.217966010924269,
          b: -1.6358040552978632,
          c: 0.020135592475386876,
          d: 14.656910965711674,
          e: 10.441789295712542,
          f: -0.01268020393811542,
        }
      }),
    ),
  }

export function getVariationPreviewFlame(
  type: TransformVariationType,
): FlameDescriptor {
  return previewFlames[type] ?? getDefaultFlameByVarType(type)
}
