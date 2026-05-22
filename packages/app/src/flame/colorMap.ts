/**
 * Color map system for fractal flames.
 *
 * A ColorMap defines how points are colored during flame iteration.
 * Each entry maps a color index (0-based) to OkLab a/b coordinates.
 * When a flame has N transforms, each transform gets a color from the map
 * based on its index. For example, with 3 transforms and a 3-entry map:
 *   transform 0 → map[0]
 *   transform 1 → map[1]
 *   transform 2 → map[2]
 *
 * If the flame has more transforms than the map, the last entry is reused.
 * Maps with fewer entries than transforms will cycle through their entries.
 */

export type ColorMapEntry = {
  /** OkLab 'a' channel (typically -1 to 1) */
  a: number
  /** OkLab 'b' channel (typically -1 to 1) */
  b: number
  /** Optional label for this color (e.g. "Warm Red", "Cool Blue") */
  label?: string
}

export type ColorMap = {
  id: string
  name: string
  /** Ordered list of OkLab a/b color entries */
  entries: ColorMapEntry[]
  /** Optional short description */
  description?: string
}

/** Storage type for palette data */
export type PaletteEntry = {
  id: string
  /** Position in the gradient (0 to 1) */
  position: number
  /** OkLab a channel */
  a: number
  /** OkLab b channel */
  b: number
}

export type Palette = {
  id: string
  name: string
  entries: PaletteEntry[]
  /** Source of the palette */
  source: 'builtin' | 'custom' | 'imported' | 'official'
  createdAt?: number
}

function generatePaletteId(): string {
  return `palette-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function paletteEntry(
  position: number,
  a: number,
  b: number,
): PaletteEntry {
  return {
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    position,
    a,
    b,
  }
}

export function palette(
  id: string,
  name: string,
  entries: PaletteEntry[],
  source: Palette['source'] = 'builtin',
): Palette {
  return { id, name, entries, source, createdAt: Date.now() }
}

/** Convert a palette to ColorMap entries for use with flames */
export function paletteToColorMap(
  palette: Palette,
  count: number = 5,
): ColorMapEntry[] {
  const sorted = [...palette.entries].sort((a, b) => a.position - b.position)
  if (sorted.length === 0) return [{ a: 0, b: 0 }]
  if (sorted.length === 1) return [{ a: sorted[0]!.a, b: sorted[0]!.b }]

  const entries: ColorMapEntry[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    entries.push(interpolatePaletteEntry(sorted, t))
  }
  return entries
}

function interpolatePaletteEntry(
  sorted: PaletteEntry[],
  t: number,
): ColorMapEntry {
  // Find the two entries this t falls between
  let lower = sorted[0]!
  let upper = sorted[sorted.length - 1]!

  for (let i = 0; i < sorted.length - 1; i++) {
    if (t >= sorted[i]!.position && t <= sorted[i + 1]!.position) {
      lower = sorted[i]!
      upper = sorted[i + 1]!
      break
    }
  }

  // Interpolate between lower and upper
  const range = upper.position - lower.position
  const localT = range > 0 ? (t - lower.position) / range : 0

  return {
    a: lower.a + (upper.a - lower.a) * localT,
    b: lower.b + (upper.b - lower.b) * localT,
  }
}

/** Convert a palette to a ColorMap */
export function paletteToColorMap2(palette: Palette, name: string): ColorMap {
  const entries = paletteToColorMap(
    palette,
    Math.max(5, palette.entries.length),
  )
  return {
    id: palette.id,
    name,
    entries: entries.map((e, i) => ({ ...e, label: `Stop ${i + 1}` })),
  }
}

/** Storage key for custom palettes */
const CUSTOM_PALETTES_KEY = 'chaos-master-custom-palettes'

/**
 * Load custom palettes from localStorage
 */
export function loadCustomPalettes(): Palette[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PALETTES_KEY)
    if (raw === null || raw === '') return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is Palette =>
        typeof p === 'object' &&
        p !== null &&
        typeof p.id === 'string' &&
        Array.isArray(p.entries),
    )
  } catch {
    return []
  }
}

/**
 * Save custom palettes to localStorage
 */
export function saveCustomPalettes(palettes: Palette[]): void {
  localStorage.setItem(CUSTOM_PALETTES_KEY, JSON.stringify(palettes))
}

/**
 * Add a custom palette
 */
export function addCustomPalette(
  palette: Omit<Palette, 'id' | 'createdAt'>,
): Palette {
  const newPalette: Palette = {
    ...palette,
    id: generatePaletteId(),
    createdAt: Date.now(),
  }
  const existing = loadCustomPalettes()
  saveCustomPalettes([...existing, newPalette])
  return newPalette
}

/**
 * Delete a custom palette by ID
 */
export function deleteCustomPalette(id: string): void {
  const existing = loadCustomPalettes()
  saveCustomPalettes(existing.filter((p) => p.id !== id))
}

/**
 * Update a custom palette
 */
export function updateCustomPalette(
  id: string,
  updates: Partial<Omit<Palette, 'id' | 'createdAt'>>,
): Palette | null {
  const existing = loadCustomPalettes()
  const idx = existing.findIndex((p) => p.id === id)
  if (idx === -1) return null

  const updated: Palette = {
    ...existing[idx]!,
    ...updates,
  }
  existing[idx] = updated
  saveCustomPalettes(existing)
  return updated
}

/**
 * Convert a Palette to ColorMapEntry[] for transform coloring
 */
export function paletteToEntries(
  palette: Palette,
  count: number,
): ColorMapEntry[] {
  return paletteToColorMap(palette, count)
}

/** Helper to create a color entry */
export function colorEntry(
  a: number,
  b: number,
  label?: string,
): ColorMapEntry {
  return label !== undefined ? { a, b, label } : { a, b }
}

/** Helper to create a color map */
export function colorMap(
  id: string,
  name: string,
  entries: ColorMapEntry[],
  description?: string,
): ColorMap {
  return description !== undefined
    ? { id, name, entries, description }
    : { id, name, entries }
}

/**
 * Apply a color map to a flame's transforms.
 * Each transform gets the color at its index (wrapping around if needed).
 */
export function applyColorMapToFlame(
  flame: { transforms: Record<string, { color: { x: number; y: number } }> },
  colorMap: ColorMap,
): void {
  const keys = Object.keys(flame.transforms)
  keys.forEach((key, index) => {
    const entry = colorMap.entries[index % colorMap.entries.length]!
    flame.transforms[key]!.color = { x: entry.a, y: entry.b }
  })
}

/** Default color maps for flames (using entries) */
export const defaultColorMaps: ColorMap[] = [
  colorMap(
    'grayscale',
    'Grayscale',
    [colorEntry(0, 0, 'Neutral')],
    'Classic grayscale flame rendering',
  ),
  colorMap(
    'fire',
    'Fire',
    [
      colorEntry(-0.5, 0.1, 'Deep Red'),
      colorEntry(0.2, 0.5, 'Orange'),
      colorEntry(0.6, 0.4, 'Yellow'),
    ],
    'Warm fire-like palette',
  ),
  colorMap(
    'ocean',
    'Ocean',
    [
      colorEntry(-0.3, -0.6, 'Deep Blue'),
      colorEntry(-0.1, -0.3, 'Teal'),
      colorEntry(0.2, 0.1, 'Aqua'),
      colorEntry(0.5, 0.2, 'Sea Green'),
    ],
    'Cool oceanic blues and teals',
  ),
  colorMap(
    'sunset',
    'Sunset',
    [
      colorEntry(0.5, 0.4, 'Pink'),
      colorEntry(0.6, 0.3, 'Orange'),
      colorEntry(0.7, 0.1, 'Amber'),
      colorEntry(-0.1, 0.5, 'Magenta'),
    ],
    'Warm sunset gradient',
  ),
  colorMap(
    'neon',
    'Neon',
    [
      colorEntry(0.8, 0.8, 'Magenta'),
      colorEntry(-0.6, 0.6, 'Cyan'),
      colorEntry(0.5, -0.6, 'Lime'),
      colorEntry(-0.8, -0.3, 'Violet'),
    ],
    'Vibrant neon colors',
  ),
  colorMap(
    'pastel',
    'Pastel',
    [
      colorEntry(0.2, 0.1, 'Blush'),
      colorEntry(-0.1, 0.2, 'Lavender'),
      colorEntry(0.1, -0.2, 'Mint'),
      colorEntry(0.3, 0.3, 'Peach'),
    ],
    'Soft pastel tones',
  ),
  colorMap(
    'earth',
    'Earth',
    [
      colorEntry(0.3, 0.4, 'Sienna'),
      colorEntry(0.5, 0.5, 'Ochre'),
      colorEntry(-0.2, 0.3, 'Olive'),
      colorEntry(0.1, 0.5, 'Rust'),
    ],
    'Natural earth tones',
  ),
  colorMap(
    'ice',
    'Ice',
    [
      colorEntry(-0.2, -0.3, 'Ice Blue'),
      colorEntry(-0.4, -0.1, 'Glacier'),
      colorEntry(0, -0.5, 'Arctic'),
      colorEntry(0.1, 0.1, 'Frost'),
    ],
    'Cold icy blues',
  ),
  colorMap(
    'rainbow',
    'Rainbow',
    [
      colorEntry(0.8, 0.6, 'Red'),
      colorEntry(0.7, 0.5, 'Orange'),
      colorEntry(0.5, 0.4, 'Yellow'),
      colorEntry(-0.3, 0.5, 'Green'),
      colorEntry(-0.6, 0.3, 'Cyan'),
      colorEntry(-0.8, 0.5, 'Blue'),
      colorEntry(-0.6, 0.7, 'Violet'),
    ],
    'Full rainbow spectrum',
  ),
  colorMap(
    'monochrome-blue',
    'Monochrome Blue',
    [
      colorEntry(-0.2, -0.4, 'Dark Blue'),
      colorEntry(-0.1, -0.3, 'Medium Blue'),
      colorEntry(0.1, -0.5, 'Cyan Blue'),
    ],
    'Blue channel variation',
  ),
]
