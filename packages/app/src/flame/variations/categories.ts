export const CATEGORIES = [
  'general',
  'blur',
  'post',
  'pre',
  'crop',
  'symmetry',
  'dc',
  'glsl',
  'cut',
  '3d',
  'custom',
] as const

export type VariationCategory = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<VariationCategory, string> = {
  general: 'General',
  blur: 'Blur',
  post: 'Post-Processing',
  pre: 'Pre-Processing',
  crop: 'Crop',
  symmetry: 'Symmetry',
  dc: 'Direct Color',
  glsl: 'GLSL Shaders',
  cut: 'Cut',
  '3d': '3D',
  custom: 'Custom',
}

export const CATEGORY_ORDER: Record<VariationCategory, number> = {
  general: 0,
  blur: 1,
  post: 2,
  pre: 3,
  crop: 4,
  symmetry: 5,
  dc: 6,
  glsl: 7,
  cut: 8,
  '3d': 9,
  custom: 10,
}

export function sortByCategory(
  a: VariationCategory,
  b: VariationCategory,
): number {
  return CATEGORY_ORDER[a] - CATEGORY_ORDER[b]
}
