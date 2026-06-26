import { defineExample } from '@/flame/examples/util'
import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * A minimal single-transform flame that applies one variation at weight 1, used
 * to render a small live preview of a custom variation (in the editor and when
 * loading a shared variation). Fresh transform/variation ids per call.
 *
 * Render settings mirror the VariationSelector gallery so custom previews read
 * the same: it floors exposure at 1.3 and gamma at 5.0 over a gaussian-disk
 * point init with colorSpeed 0 (see VariationSelector PREVIEW_MIN_EXPOSURE /
 * PREVIEW_MIN_GAMMA and getDefaultFlameByVarType). Without the lift, custom
 * previews render much darker than the gallery thumbnails.
 */
export function makeCustomVariationPreviewFlame(
  variationType: string,
): FlameDescriptor {
  return defineExample({
    renderSettings: {
      exposure: 1.3,
      gamma: 5.0,
      skipIters: 1,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      camera: { zoom: 1, position: [0, 0] },
      colorInitMode: 'colorInitPosition',
      pointInitMode: 'pointInitGaussianDisk',
    },
    transforms: {
      [generateTransformId('custom_preview')]: {
        probability: 1,
        preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0, y: 0 },
        // colorSpeed 0 keeps the position-derived color from decaying to gray
        // over the per-chain plot loop (matches the gallery preview).
        colorSpeed: 0,
        variations: {
          [generateVariationId()]: {
            type: variationType,
            weight: 1,
            visible: true,
          },
        },
      },
    },
  })
}
