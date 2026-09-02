import { getAllCommands } from '@/commands/registry'

/**
 * Argument shapes for the commands an Arcade mode allows.
 *
 * `list_commands` returns ids, labels and prose descriptions but no arity,
 * and `preflightReplayCommand` rejects anything that does not match the
 * canonical replay signature exactly — `flame.addTransform` needs the two ids
 * it is about to mint, not just a variation type. Without this table a blind
 * agent has to brute-force the signatures, so the lesson brief ships it.
 *
 * Keep every hint to one short line: the whole brief must stay well under the
 * ~1.5 KB tool-result budget.
 */
const COMMAND_ARG_HINTS: Readonly<Record<string, string>> = {
  'flame.addTransform': '[variationType, newTransformId, newVariationId]',
  'flame.deleteTransform': '[transformId, newVariationId]',
  'flame.addVariation': '[transformId, variationType, newVariationId]',
  'flame.deleteVariation': '[transformId, variationId]',
  'flame.setVariation': '[transformId, variationId, { type: variationType }]',
  'flame.setVariationWeight': '[transformId, variationId, weight]',
  'flame.setVariationParams': '[transformId, variationId, paramName, number]',
  'flame.setVariationVisible': '[transformId, variationId, boolean]',
  'flame.setProbability': '[transformId, probability]',
  'flame.setColorSpeed': '[transformId, colorSpeed]',
  'flame.setTransformAffine': '[transformId, "pre"|"post", {a,b,c,d,e,f}]',
  'flame.setAffine': '[transformId, "pre"|"post", "a".."f", number]',
  'flame.setFinalAffine': '["a".."f", number]',
  'flame.setFinalTransform': '[{a,b,c,d,e,f} or null]',
  'flame.applySymmetry': '[n, "rotational"|"dihedral"]',
  'flame.applyPalette':
    '[{ id, name, source: "custom", entries: [{ id, position 0-1, a, b }] }] (OkLab a/b)',
  'flame.removePalette': '[{ transformId: { x, y } }] colours to restore',
  'flame.setTransformColor': '[transformId, x, y]',
  'flame.setAllTransformColors': '[{ transformId: { x, y } }]',
  'flame.setBackgroundColor': '[r, g, b] each 0-1',
  'flame.setDrawMode': '["light"|"paint"]',
  'sidebar.open': '[] or [boolean]',
  'lesson.note': '[text] — prefer the arcade_narrate tool',
  'timeline.setFps': '[fps 1-60]',
  'timeline.setLoopMode': '["off"|"seamless"|"cycle"]',
}

/**
 * A readable sample of the 400+ registered variation types. Enough for a
 * lesson without spending the result budget on a full registry dump.
 */
export const SAMPLE_VARIATION_TYPES = [
  'linearVar',
  'sphericalVar',
  'swirlVar',
  'juliaVar',
  'sinusoidalVar',
  'horseshoeVar',
  'discVar',
  'polarVar',
  'heartVar',
  'diamondVar',
  'eyefishVar',
  'bubbleVar',
] as const

/**
 * One mode's allow-list as concrete `"<id> <arg shape>"` lines: dot-prefixes
 * expanded against the registry, argument shapes appended where the
 * signature is not a single obvious value. One array instead of an id list
 * plus a parallel hint map, because the brief pays for every byte twice.
 */
export function describeAllowedCommands(allowed: readonly string[]): string[] {
  const ids: string[] = []
  for (const entry of allowed) {
    if (!entry.endsWith('.')) {
      ids.push(entry)
      continue
    }
    for (const cmd of getAllCommands()) {
      if (cmd.id.startsWith(entry) && cmd.replayable !== false) ids.push(cmd.id)
    }
  }
  return [...new Set(ids)].map((id) => {
    const hint = COMMAND_ARG_HINTS[id]
    return hint === undefined ? id : `${id} ${hint}`
  })
}
