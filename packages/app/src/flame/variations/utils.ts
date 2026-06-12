import { produce, unfreeze } from 'structurajs'
import { generateTransformId, generateVariationId } from '../transformFunction'
import { isParametricVariationType3D, isVariationType3D, transformVariations3D, } from '../variations3D'
import { allTransformVariations, isParametricVariationType, transformVariations, } from '.'
import type { FlameDescriptor } from '../schema/flameSchema'
import type { TransformVariationType3D } from '../variations3D'
import type { TransformVariationDescriptor, TransformVariationType } from '.'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export type AnyVariationType = TransformVariationType | TransformVariationType3D

export function getNormalizedVariationName(
  type: TransformVariationType | TransformVariationType3D,
): string {
  return type.replace(/Var$/, '').replace(/3D$/, '')
}

export function getVariationDefault(
  type: TransformVariationType | TransformVariationType3D,
  weight: number,
): TransformVariationDescriptor {
  const isParametric =
    isParametricVariationType(type) ||
    (isVariationType3D(type) && isParametricVariationType3D(type))

  if (!isParametric) {
    return {
      type,
      weight,
      visible: true,
    }
  }
  const variation = allTransformVariations[type] as {
    paramDefaults: Record<string, number>
  }
  return {
    type,
    params: { ...variation.paramDefaults },
    weight,
    visible: true,
  } as unknown as TransformVariationDescriptor
}

export function getParamsEditor<T extends { type: string; params?: unknown }>(
  variation: T,
): { component: EditorFor<T['params']>; value: T['params'] } {
  const v = allTransformVariations[variation.type]
  return {
    component: v.editor,
    get value() {
      return variation.params as T['params']
    },
  }
}

const transformPreviewIds = [
  ...Object.keys(transformVariations),
  ...Object.keys(transformVariations3D),
].reduce<Record<string, { tid: string; vid: string }>>((acc, type) => {
  acc[type] = {
    tid: generateTransformId(type),
    vid: generateVariationId(),
  }
  return acc
}, {})
export function getTransformPreviewTid(type: AnyVariationType) {
  if (!transformPreviewIds[type]) {
    transformPreviewIds[type] = {
      tid: generateTransformId(type),
      vid: generateVariationId(),
    }
  }
  return transformPreviewIds[type].tid
}
export function getTransformPreviewVid(type: AnyVariationType) {
  if (!transformPreviewIds[type]) {
    transformPreviewIds[type] = {
      tid: generateTransformId(type),
      vid: generateVariationId(),
    }
  }
  return transformPreviewIds[type].vid
}

export function getDefaultFlameByVarType(
  type: TransformVariationType,
): FlameDescriptor {
  return {
    renderSettings: {
      exposure: 0.3,
      skipIters: 1,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      camera: {
        zoom: 1,
        position: [0, 0],
        rotation: 0,
      },
      colorInitMode: 'colorInitPosition',
      pointInitMode: 'pointInitGaussianDisk',
    },
    transforms: {
      [getTransformPreviewTid(type)]: {
        probability: 1,
        preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0, y: 0 },
        variations: {
          [getTransformPreviewVid(type)]: getVariationDefault(type, 1.0),
        },
      },
    },
  } as unknown as FlameDescriptor
}

const previewFlames: Partial<Record<TransformVariationType, FlameDescriptor>> =
  {
    horseshoeVar: unfreeze(
      produce(getDefaultFlameByVarType('horseshoeVar'), (draft) => {
        draft.transforms[getTransformPreviewTid('horseshoeVar')]!.preAffine = {
          c: 0.4489954195606869,
          f: -0.4301584776979597,
          a: -0.6331653685349898,
          b: -0.6087500485024285,
          d: -1.0517990037014098,
          e: -0.4865003428489606,
        }
      }),
    ),
    crossVar: unfreeze(
      produce(getDefaultFlameByVarType('crossVar'), (draft) => {
        draft.transforms[getTransformPreviewTid('crossVar')]!.preAffine = {
          c: -0.018140589569160814,
          f: 0.018140589569160953,
          a: 2.001308488559136,
          b: -0.009967503645097698,
          d: 0.0274246123309187,
          e: 1.955389021287148,
        }
      }),
    ),
    cylinderVar: unfreeze(
      produce(getDefaultFlameByVarType('cylinderVar'), (draft) => {
        draft.renderSettings.exposure = 0.666
        draft.renderSettings.camera = {
          zoom: 0.3493516243061941,
          position: [0.20715316352406743, -0.16595190682220834],
          rotation: 0,
        }
        draft.transforms[getTransformPreviewTid('cylinderVar')]!.preAffine = {
          c: -0.013468013468013407,
          f: 0,
          a: 2.6554162592699293,
          b: -2.2134740265402675,
          d: 1.6229514134593572,
          e: 1.8246557550917812,
        }
      }),
    ),
    diamondVar: unfreeze(
      produce(getDefaultFlameByVarType('diamondVar'), (draft) => {
        draft.transforms[getTransformPreviewTid('diamondVar')]!.preAffine = {
          c: 0,
          f: 0,
          a: 0.5752348183753919,
          b: 4.552930872842858,
          d: 3.306719089367465,
          e: -0.28255288522493477,
        }
      }),
    ),
    fanVar: unfreeze(
      produce(getDefaultFlameByVarType('fanVar'), (draft) => {
        draft.transforms[getTransformPreviewTid('fanVar')]!.preAffine = {
          c: 0.3030303030303029,
          f: 0.35151515151515156,
          a: 0.6931111689557807,
          b: 0.04304811234031391,
          d: 0.04827625346378865,
          e: 0.7132582839731785,
        }
      }),
    ),
    wavesVar: unfreeze(
      produce(getDefaultFlameByVarType('wavesVar'), (draft) => {
        draft.transforms[getTransformPreviewTid('wavesVar')]!.preAffine = {
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
        draft.transforms[getTransformPreviewTid('ngonVar')]!.preAffine = {
          c: -0.01212121212121231,
          f: -0.06060606060606066,
          a: 1.2940090947979932,
          b: -0.2008651636171157,
          d: 0.37721466299031076,
          e: 1.294204089963071,
        }
        draft.transforms[getTransformPreviewTid('ngonVar')]!.variations[
          getTransformPreviewVid('ngonVar')
        ] = {
          type: 'ngonVar',
          weight: 1.0,
          visible: true,
          params: {
            power: 2,
            sides: 6,
            corners: 2,
            circle: 0,
          },
        }
      }),
    ),
    popcornVar: unfreeze(
      produce(getDefaultFlameByVarType('popcornVar'), (draft) => {
        draft.transforms[getTransformPreviewTid('popcornVar')]!.preAffine = {
          a: 1,
          b: 0,
          c: -0.28224055579678675,
          d: 0,
          e: 1,
          f: -0.39079461571862784,
        }
      }),
    ),
    ringsVar: unfreeze(
      produce(getDefaultFlameByVarType('ringsVar'), (draft) => {
        draft.transforms[getTransformPreviewTid('ringsVar')]!.preAffine = {
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
        draft.transforms[getTransformPreviewTid('rectanglesVar')]!.variations[
          getTransformPreviewVid('rectanglesVar')
        ] = {
          type: 'rectanglesVar',
          weight: 1.0,
          visible: true,
          params: {
            x: 1,
            y: 1,
          },
        }
      }),
    ),
    rings2Var: unfreeze(
      produce(getDefaultFlameByVarType('rings2Var'), (draft) => {
        draft.renderSettings.exposure = 0.552
        draft.transforms[getTransformPreviewTid('rings2Var')]!.preAffine = {
          c: 0.05976331360946743,
          f: -0.1600838264299801,
          a: 1.6440360757046795,
          b: 1.8433469574444175,
          d: 1.7823436569258906,
          e: -0.5000425830694895,
        }
        draft.transforms[getTransformPreviewTid('rings2Var')]!.variations[
          getTransformPreviewVid('rings2Var')
        ] = {
          type: 'rings2Var',
          weight: 1.0,
          visible: true,
          params: {
            val: 1.2,
          },
        }
      }),
    ),
    secantVar: unfreeze(
      produce(getDefaultFlameByVarType('secantVar'), (draft) => {
        draft.renderSettings.exposure = 2.0
        draft.renderSettings.camera.zoom = 1.0
        draft.renderSettings.camera.position = [
          0.22031681118067803, 0.18394228752956718,
        ]
        draft.transforms[getTransformPreviewTid('secantVar')]!.preAffine = {
          a: 2.217966010924269,
          b: -1.6358040552978632,
          c: 0.020135592475386876,
          d: 14.656910965711674,
          e: 10.441789295712542,
          f: -0.01268020393811542,
        }
      }),
    ),
    circusVar: unfreeze(
      produce(getDefaultFlameByVarType('circusVar'), (draft) => {
        draft.transforms[getTransformPreviewTid('circusVar')]!.preAffine = {
          a: 1.5067596708863726,
          b: -0.11207495085714227,
          c: 0.003943048417568207,
          d: 0.11207495085714227,
          e: 1.5067596708863726,
          f: 0.011692757718265057,
        }
        draft.renderSettings.exposure = 0.666
        draft.renderSettings.camera.zoom = 0.5
      }),
    ),
    tunnelVar: unfreeze(
      produce(getDefaultFlameByVarType('tunnelVar'), (draft) => {
        draft.renderSettings.exposure = -1.0
      }),
    ),
    tradeVar: unfreeze(
      produce(getDefaultFlameByVarType('tradeVar'), (draft) => {
        draft.renderSettings.camera.zoom = 0.75
        draft.renderSettings.exposure = 0.42
        draft.transforms[getTransformPreviewTid('tradeVar')]!.variations[
          getTransformPreviewVid('tradeVar')
        ] = {
          type: 'tradeVar',
          weight: 1.0,
          visible: true,
          params: { r1: 1.21, d1: 0.53, r2: 1.76, d2: 0.4 },
        }
      }),
    ),
    popcorn2Var: unfreeze(
      produce(getDefaultFlameByVarType('popcorn2Var'), (draft) => {
        draft.renderSettings.camera.zoom = 0.5
        draft.renderSettings.exposure = 0.6
        draft.transforms[getTransformPreviewTid('popcorn2Var')]!.variations[
          getTransformPreviewVid('popcorn2Var')
        ] = {
          type: 'popcorn2Var',
          weight: 1.0,
          visible: true,
          params: { x: -1.28, y: -0.94, c: -2.49 },
        }
      }),
    ),
    spirographVar: unfreeze(
      produce(getDefaultFlameByVarType('spirographVar'), (draft) => {
        draft.renderSettings.camera.zoom = 0.2
        draft.renderSettings.camera.position = [-1.6, -2.0]
        draft.renderSettings.exposure = 1.2
        draft.transforms[getTransformPreviewTid('spirographVar')]!.variations[
          getTransformPreviewVid('spirographVar')
        ] = {
          type: 'spirographVar',
          weight: 1.0,
          visible: true,
          params: {
            a: 3.25,
            b: 1.96,
            d: -3.53,
            tmin: -3.2,
            tmax: -7.7,
            ymin: -0.48,
            ymax: -3.15,
            c1: -1.04,
            c2: -2.16,
          },
        }
      }),
    ),
    pixelFlowVar: unfreeze(
      produce(getDefaultFlameByVarType('pixelFlowVar'), (draft) => {
        draft.renderSettings.camera.zoom = 0.595
        draft.renderSettings.camera.position = [0.2323, 0.0853]
        draft.renderSettings.exposure = 0.566
        draft.transforms[getTransformPreviewTid('pixelFlowVar')]!.variations = {
          [getTransformPreviewVid('pixelFlowVar')]: {
            type: 'pixelFlowVar',
            weight: 1.0,
            visible: true,
            params: {
              scale_x: 1.0,
              scale_y: 1.0,
              speed_x: 0.0,
              speed_y: 0.0,
              seed: 46472,
            },
          },
          [generateVariationId()]: {
            type: 'linearVar',
            weight: 1,
            visible: true,
          },
        }
      }),
    ),
    acosechVar: unfreeze(
      produce(getDefaultFlameByVarType('acosechVar'), (draft) => {
        const tid = getTransformPreviewTid('acosechVar')
        const vid = getTransformPreviewVid('acosechVar')
        draft.renderSettings.exposure = 0.8
        draft.transforms[tid]!.variations[vid] = {
          type: 'acosechVar',
          weight: 0.09,
          visible: true,
        }
      }),
    ),
    acoshVar: unfreeze(
      produce(getDefaultFlameByVarType('acoshVar'), (draft) => {
        const tid = getTransformPreviewTid('acoshVar')
        const vid = getTransformPreviewVid('acoshVar')
        draft.renderSettings.exposure = 0.8
        draft.transforms[tid]!.variations[vid] = {
          type: 'acoshVar',
          weight: 0.09,
          visible: true,
        }
      }),
    ),
    acothVar: unfreeze(
      produce(getDefaultFlameByVarType('acothVar'), (draft) => {
        const tid = getTransformPreviewTid('acothVar')
        const vid = getTransformPreviewVid('acothVar')
        draft.renderSettings.exposure = 0.8
        draft.transforms[tid]!.variations[vid] = {
          type: 'acothVar',
          weight: 0.09,
          visible: true,
        }
      }),
    ),
    arcsinhVar: unfreeze(
      produce(getDefaultFlameByVarType('arcsinhVar'), (draft) => {
        const tid = getTransformPreviewTid('arcsinhVar')
        const vid = getTransformPreviewVid('arcsinhVar')
        draft.renderSettings.exposure = 0.8
        draft.transforms[tid]!.variations[vid] = {
          type: 'arcsinhVar',
          weight: 0.12,
          visible: true,
        }
      }),
    ),
    fociVar: unfreeze(
      produce(getDefaultFlameByVarType('fociVar'), (draft) => {
        const tid = getTransformPreviewTid('fociVar')
        const vid = getTransformPreviewVid('fociVar')
        draft.transforms[tid]!.variations[vid] = {
          type: 'fociVar',
          weight: 0.23,
          visible: true,
        }
      }),
    ),
    cornersVar: unfreeze(
      produce(getDefaultFlameByVarType('cornersVar'), (draft) => {
        draft.renderSettings.camera.zoom = 0.4
        draft.renderSettings.exposure = 0.5
        draft.transforms[getTransformPreviewTid('cornersVar')]!.variations[
          getTransformPreviewVid('cornersVar')
        ] = {
          type: 'cornersVar',
          weight: 1.0,
          visible: true,
          params: {
            x: 1.0,
            y: 1.0,
            mult_x: 1.0,
            mult_y: 1.0,
            x_power: 0.75,
            y_power: 0.75,
            xy_power_add: 0.0,
            log_mode: 0.0,
            log_base: 2.71828,
          },
        }
      }),
    ),
    checksVar: unfreeze(
      produce(getDefaultFlameByVarType('checksVar'), (draft) => {
        draft.renderSettings.exposure = 0.7
        draft.transforms[getTransformPreviewTid('checksVar')]!.preAffine = {
          c: 0.0,
          f: 0.0,
          a: 0.5,
          b: 0.5,
          d: -0.5,
          e: 0.5,
        }
        draft.transforms[getTransformPreviewTid('checksVar')]!.variations[
          getTransformPreviewVid('checksVar')
        ] = {
          type: 'checksVar',
          weight: 0.17,
          visible: true,
          params: { x: 3.0, y: 3.0, size: 1.0, rnd: 0.5 },
        }
      }),
    ),
    plusRecipVar: unfreeze(
      produce(getDefaultFlameByVarType('plusRecipVar'), (draft) => {
        draft.renderSettings.exposure = 0.5
        draft.renderSettings.camera.zoom = 0.5
        draft.transforms[getTransformPreviewTid('plusRecipVar')]!.variations[
          getTransformPreviewVid('plusRecipVar')
        ] = {
          type: 'plusRecipVar',
          weight: 0.25,
          visible: true,
          params: { ar: 1.0, ai: 0.5 },
        }
      }),
    ),
    arctanhVar: unfreeze(
      produce(getDefaultFlameByVarType('arctanhVar'), (draft) => {
        draft.transforms[getTransformPreviewTid('arctanhVar')]!.variations[
          getTransformPreviewVid('arctanhVar')
        ] = {
          type: 'arctanhVar',
          weight: 0.04,
          visible: true,
        }
      }),
    ),
    logTile2Var: unfreeze(
      produce(getDefaultFlameByVarType('logTile2Var'), (draft) => {
        draft.transforms[getTransformPreviewTid('logTile2Var')]!.variations[
          getTransformPreviewVid('logTile2Var')
        ] = {
          type: 'logTile2Var',
          weight: 0.2,
          visible: true,
          params: { spreadx: 2.0, spready: 2.0 },
        }
      }),
    ),
    pulseVar: unfreeze(
      produce(getDefaultFlameByVarType('pulseVar'), (draft) => {
        draft.transforms[getTransformPreviewTid('pulseVar')]!.variations[
          getTransformPreviewVid('pulseVar')
        ] = {
          type: 'pulseVar',
          weight: 0.06,
          visible: true,
          params: { freqx: 2.0, freqy: 2.0, scalex: 1.0, scaley: 1.0 },
        }
      }),
    ),
    svenssonVar: unfreeze(
      produce(getDefaultFlameByVarType('svenssonVar'), (draft) => {
        draft.renderSettings.camera.zoom = 0.7
        draft.transforms[getTransformPreviewTid('svenssonVar')]!.variations[
          getTransformPreviewVid('svenssonVar')
        ] = {
          type: 'svenssonVar',
          weight: 0.5,
          visible: true,
          params: { a: 1.4, b: 1.56, c: 1.4, d: -6.56 },
        }
      }),
    ),
    taurusVar: unfreeze(
      produce(getDefaultFlameByVarType('taurusVar'), (draft) => {
        draft.renderSettings.exposure = 0.36
        draft.renderSettings.contrast = 8.76
        draft.renderSettings.camera.zoom = 0.143
        draft.renderSettings.camera.position = [-0.177, 0.195]

        const tid = getTransformPreviewTid('taurusVar')
        const vid = getTransformPreviewVid('taurusVar')
        draft.transforms[tid]!.variations[vid] = {
          type: 'taurusVar',
          weight: 1.0,
          visible: true,
          params: { r: 1.9, n: 5, inv: -0.65, sor: -0.7 },
        }
      }),
    ),
    murl2Var: unfreeze(
      produce(getDefaultFlameByVarType('murl2Var'), (draft) => {
        draft.renderSettings.exposure = 0.6
        draft.renderSettings.camera.zoom = 0.5
        draft.transforms[getTransformPreviewTid('murl2Var')]!.variations[
          getTransformPreviewVid('murl2Var')
        ] = {
          type: 'murl2Var',
          weight: 1.0,
          visible: true,
          params: { c: 0.1, power: 3.0 },
        }
      }),
    ),
    juliaOutsideVar: unfreeze(
      produce(getDefaultFlameByVarType('juliaOutsideVar'), (draft) => {
        draft.renderSettings.exposure = 0.8
        draft.renderSettings.camera.zoom = 0.4
      }),
    ),
    funnelVar: unfreeze(
      produce(getDefaultFlameByVarType('funnelVar'), (draft) => {
        draft.renderSettings.exposure = 1.0
        draft.transforms[getTransformPreviewTid('funnelVar')]!.variations[
          getTransformPreviewVid('funnelVar')
        ] = {
          type: 'funnelVar',
          weight: 0.05,
          visible: true,
          params: { effect: 8.0 },
        }
      }),
    ),
    splipticBSVar: unfreeze(
      produce(getDefaultFlameByVarType('splipticBSVar'), (draft) => {
        draft.renderSettings.exposure = 0.8
        draft.renderSettings.camera.zoom = 0.5
        draft.transforms[getTransformPreviewTid('splipticBSVar')]!.variations[
          getTransformPreviewVid('splipticBSVar')
        ] = {
          type: 'splipticBSVar',
          weight: 0.5,
          visible: true,
          params: { x: 0.05, y: 0.05 },
        }
      }),
    ),
    rays1Var: unfreeze(
      produce(getDefaultFlameByVarType('rays1Var'), (draft) => {
        draft.renderSettings.exposure = 1.5
        draft.renderSettings.camera.zoom = 0.196
        draft.renderSettings.camera.position = [-0.373, 0.149]
        draft.transforms[getTransformPreviewTid('rays1Var')]!.variations[
          getTransformPreviewVid('rays1Var')
        ] = {
          type: 'rays1Var',
          weight: 0.5,
          visible: true,
        }
      }),
    ),
    sTwinVar: unfreeze(
      produce(getDefaultFlameByVarType('sTwinVar'), (draft) => {
        draft.renderSettings.exposure = 2.2
        draft.renderSettings.camera.zoom = 0.4
      }),
    ),
    blockYVar: unfreeze(
      produce(getDefaultFlameByVarType('blockYVar'), (draft) => {
        draft.renderSettings.exposure = 2.2
        draft.renderSettings.camera.zoom = 0.4
      }),
    ),
    coneVar: unfreeze(
      produce(getDefaultFlameByVarType('coneVar'), (draft) => {
        const tid = getTransformPreviewTid('coneVar')
        const vid = getTransformPreviewVid('coneVar')
        draft.transforms[tid]!.variations[vid] = {
          type: 'coneVar',
          weight: 1.0,
          visible: true,
          params: {
            radius1: 0.5,
            radius2: 1.0,
            size1: 0.5,
            size2: 1.1,
            ywave: 2.16,
            xwave: 1.0,
            height: 1.0,
            warp: 1.0,
            weight: 2.0,
          },
        }
      }),
    ),
  }
export function getVariationPreviewFlame(
  type: TransformVariationType,
): FlameDescriptor {
  return previewFlames[type] ?? getDefaultFlameByVarType(type)
}

// ─── 3D Preview Flames ───────────────────────────────────────────────

const IDENTITY_AFFINE_3D = {
  a: 1,
  b: 0,
  c: 0,
  d: 0,
  e: 0,
  f: 1,
  g: 0,
  h: 0,
  i: 0,
  j: 0,
  k: 1,
  l: 0,
}

export function getDefaultFlameByVarType3D(
  type: TransformVariationType3D,
): FlameDescriptor {
  return {
    renderSettings: {
      exposure: 0.3,
      skipIters: 1,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      camera: {
        zoom: 1,
        position: [0, 0],
        rotation: 0,
      },
      colorInitMode: 'colorInitPosition',
      pointInitMode: 'pointInitUnitBall',
      dimensions: 3,
    },
    transforms: {
      [getTransformPreviewTid(type)]: {
        probability: 1,
        preAffine: IDENTITY_AFFINE_3D,
        postAffine: IDENTITY_AFFINE_3D,
        color: { x: 0, y: 0 },
        variations: {
          [getTransformPreviewVid(type)]: getVariationDefault(type, 1.0),
        },
      },
    },
  } as unknown as FlameDescriptor
}

const previewFlames3D: Partial<
  Record<TransformVariationType3D, FlameDescriptor>
> = {}

export function getVariationPreviewFlame3D(
  type: TransformVariationType3D,
): FlameDescriptor {
  return previewFlames3D[type] ?? getDefaultFlameByVarType3D(type)
}
