import { SAMPLE_VARIATION_TYPES } from '@/arcade/commandHints'
import { isParametricVariationType, transformVariations, variationTypes, } from '@/flame/variations'
import { isParametricVariationType3D, transformVariations3D, variationTypes3D, } from '@/flame/variations3D'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

/**
 * The registry is 446 names long and was reachable only by guessing.
 *
 * An agent asked to teach variations had no way to learn one name: nothing
 * enumerated the registry, `linear` is rejected because the registered name is
 * `linearVar`, and a failed guess is free while a successful one costs an add
 * and a delete. One session spent 26 of its 45 steps probing 13 names before
 * the lesson could start. This tool is the listing that makes that unnecessary,
 * and it is free: read-only, no step, no lock.
 */

/** Names per page. The full 2D registry is ~14 KB of JSON; a page is ~2 KB. */
const DEFAULT_LIMIT = 80
const MAX_LIMIT = 200

/**
 * Enough of each family to start a lesson without a single probe.
 *
 * The eight the lesson brief already sends, plus the parametric and angular
 * ones a teacher reaches for next — the run that prompted this tool probed
 * exactly these six on top of the brief's list.
 */
const STARTERS: readonly string[] = [
  ...SAMPLE_VARIATION_TYPES,
  'handkerchiefVar',
  'bubbleVar',
  'crossVar',
  'curlVar',
  'pdjVar',
  'juliaNVar',
]

function paramNames(type: string, in3D: boolean): string[] | undefined {
  const variation = in3D
    ? transformVariations3D[type as never]
    : transformVariations[type]
  const schema = (
    variation as
      | { DescriptorSchema?: { entries?: Record<string, unknown> } }
      | undefined
  )?.DescriptorSchema?.entries?.params
  // `params` is an object schema, or that schema wrapped in `v.optional` when
  // the variation ships defaults. Both carry the names on `entries`.
  const entries = schema as
    | {
        entries?: Record<string, unknown>
        wrapped?: { entries?: Record<string, unknown> }
      }
    | undefined
  const names = Object.keys(entries?.wrapped?.entries ?? entries?.entries ?? {})
  return names.length > 0 ? names : undefined
}

export const listVariations: WebMcpTool = {
  name: 'list_variations',
  description:
    'List the variation type names this build registers, for flame.addTransform, flame.addVariation and flame.setVariation. Names end in "Var" for 2D flames ("sphericalVar", not "spherical"); the 3D registry uses its own names ("spiral3D"). Defaults to the family the current flame renders in. Pass search to filter, parametricOnly for the ones that take params (their parameter names come back with them), and starters:true for a short list to teach from. Read-only: it costs no step.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Case-insensitive substring, e.g. "julia" or "blur"',
      },
      dimensions: {
        type: 'integer',
        enum: [2, 3],
        description: "Which registry to list (default: the current flame's)",
      },
      parametricOnly: {
        type: 'boolean',
        description:
          'Only variations that take parameters, listed with their parameter names',
      },
      starters: {
        type: 'boolean',
        description:
          'A short cross-section of the classic families, enough to teach from',
      },
      limit: {
        type: 'integer',
        description: `Names per page, 1-${MAX_LIMIT} (default ${DEFAULT_LIMIT})`,
      },
      offset: { type: 'integer', description: 'Skip this many names' },
    },
  },
  annotations: { readOnlyHint: true },
  execute: (input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>
    const ctx = getWebMcpContext()
    const flameDimensions = ctx?.flameDescriptor().renderSettings.dimensions
    const in3D =
      raw.dimensions === 3 || (raw.dimensions !== 2 && flameDimensions === 3)
    const all = in3D ? variationTypes3D : variationTypes
    const isParametric = in3D
      ? isParametricVariationType3D
      : isParametricVariationType

    let names = [...all]
    if (raw.starters === true) {
      names = names.filter((name) => STARTERS.includes(name))
    }
    if (typeof raw.search === 'string' && raw.search.trim() !== '') {
      const needle = raw.search.trim().toLowerCase()
      names = names.filter((name) => name.toLowerCase().includes(needle))
    }
    if (raw.parametricOnly === true) {
      names = names.filter((name) => isParametric(name as never))
    }

    const total = names.length
    const offset =
      typeof raw.offset === 'number' && raw.offset > 0
        ? Math.floor(raw.offset)
        : 0
    const limit =
      typeof raw.limit === 'number' && raw.limit > 0
        ? Math.min(Math.floor(raw.limit), MAX_LIMIT)
        : DEFAULT_LIMIT
    const page = names.slice(offset, offset + limit)

    return {
      dimensions: in3D ? 3 : 2,
      total,
      offset,
      returned: page.length,
      // Parameter names come with the parametric ones: the alternative is an
      // agent writing `__nope__` into a descriptor because nothing said what
      // pdj takes. Plain names stay plain strings, which is most of them.
      variations: page.map((name) => {
        const params = isParametric(name) ? paramNames(name, in3D) : undefined
        return params === undefined ? name : { name, params }
      }),
      truncated: offset + page.length < total ? true : undefined,
      next:
        offset + page.length < total
          ? `Call again with offset ${offset + page.length}, or narrow it with search.`
          : undefined,
    }
  },
}
