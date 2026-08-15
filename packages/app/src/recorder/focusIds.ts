/**
 * Stable follow-cam identities shared by the recorder and the live UI.
 *
 * These are semantic IDs, not selectors: sessions can keep them for years
 * while the DOM that resolves them evolves. Renderer entity IDs are already
 * constrained to colon-free identifiers, which keeps the hierarchy below
 * unambiguous and lets nested targets fall back to their transform card.
 */
export const transformFocusId = (transformId: string) => `tx:${transformId}`

export const transformVisibilityFocusId = (transformId: string) =>
  `${transformFocusId(transformId)}:visibility`

export const transformColorRandomizeFocusId = (transformId: string) =>
  `${transformFocusId(transformId)}:header-color-randomize`

export const variationTypeFocusId = (
  transformId: string,
  variationId: string,
) => `${transformFocusId(transformId)}:variation:${variationId}:type`

export const variationVisibilityFocusId = (
  transformId: string,
  variationId: string,
) => `${transformFocusId(transformId)}:variation:${variationId}:visibility`

export const variationRandomizeFocusId = (
  transformId: string,
  variationId: string,
) => `${transformFocusId(transformId)}:variation:${variationId}:randomize`

export const variationParamsFocusId = (
  transformId: string,
  variationId: string,
) => `${transformFocusId(transformId)}:variation:${variationId}:params`

export const affineFocusId = (transformId: string) =>
  `${transformFocusId(transformId)}:affine`

export const affineRandomizeFocusId = (transformId: string) =>
  `${affineFocusId(transformId)}:randomize`

export const affineResetFocusId = (transformId: string) =>
  `${affineFocusId(transformId)}:reset`

export const colorFocusId = (transformId: string) =>
  `${transformFocusId(transformId)}:color`

export const colorRandomizeFocusId = (transformId: string) =>
  `${colorFocusId(transformId)}:randomize`

export const colorResetFocusId = (transformId: string) =>
  `${colorFocusId(transformId)}:reset`

export const FINAL_AFFINE_FOCUS_ID = 'affine:final'
export const FINAL_AFFINE_RANDOMIZE_FOCUS_ID = `${FINAL_AFFINE_FOCUS_ID}:randomize`
