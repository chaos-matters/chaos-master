import { isFlameGraphWithinLimits, isSafeFlameEntityId, tryValidateFlame, } from '@/flame/schema/flameSchema'
import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import { defaultLinearType, isVariationTypeFor, } from '@/flame/variationRegistry'
import { deepClone } from '@/utils/clone'
import type { CommandContext } from '../../types'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from '@/flame/schema/flameSchema'
import type { Dims } from '@/flame/variationRegistry'

export function resolveTransformKey(
  transforms: Record<string, unknown>,
  ref: unknown,
): TransformId | undefined {
  if (typeof ref === 'string') {
    return Object.hasOwn(transforms, ref) ? (ref as TransformId) : undefined
  }
  const index = typeof ref === 'number' ? ref : 0
  const keys = Object.keys(transforms) as TransformId[]
  return index >= 0 && index < keys.length ? keys[index] : undefined
}

export function resolveVariationKey(
  variations: Record<string, unknown>,
  ref: unknown,
): VariationId | undefined {
  if (typeof ref === 'string') {
    return Object.hasOwn(variations, ref) ? (ref as VariationId) : undefined
  }
  const index = typeof ref === 'number' ? ref : 0
  const keys = Object.keys(variations) as VariationId[]
  return index >= 0 && index < keys.length ? keys[index] : undefined
}

export function isAbsentRef(ref: unknown): boolean {
  return ref === undefined || ref === null
}

export const AFFINE_2D_KEYS = ['a', 'b', 'c', 'd', 'e', 'f']
export const AFFINE_3D_KEYS = [...AFFINE_2D_KEYS, 'g', 'h', 'i', 'j', 'k', 'l']
export const MAX_PALETTE_ENTRIES = 1024
export const MAX_PALETTE_TEXT_LENGTH = 256
export const MAX_PALETTE_CHANNEL_MAGNITUDE = 4

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

interface ValidatedPaletteHeader {
  id: string
  name: string
  source?: 'builtin' | 'custom' | 'imported' | 'official'
  createdAt?: number
  entries: unknown[]
}

function validatePaletteHeader(
  value: unknown,
): ValidatedPaletteHeader | undefined {
  if (!isPlainRecord(value)) return undefined
  const { id, name, source, createdAt, entries } = value
  if (
    createdAt !== undefined &&
    (typeof createdAt !== 'number' ||
      !Number.isSafeInteger(createdAt) ||
      createdAt < 0)
  ) {
    return undefined
  }
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > MAX_PALETTE_TEXT_LENGTH ||
    typeof name !== 'string' ||
    name.length > MAX_PALETTE_TEXT_LENGTH ||
    (source !== undefined &&
      source !== 'builtin' &&
      source !== 'custom' &&
      source !== 'imported' &&
      source !== 'official') ||
    !Array.isArray(entries) ||
    entries.length === 0 ||
    entries.length > MAX_PALETTE_ENTRIES
  ) {
    return undefined
  }
  return { id, name, source, createdAt, entries }
}

function validatePaletteEntry(
  entry: unknown,
  ids: Set<string>,
): Palette['entries'][number] | undefined {
  if (!isPlainRecord(entry)) return undefined
  const { id: entryId, position, a, b } = entry
  if (
    Object.keys(entry).some(
      (key) => key !== 'id' && key !== 'position' && key !== 'a' && key !== 'b',
    ) ||
    typeof entryId !== 'string' ||
    entryId.length === 0 ||
    entryId.length > MAX_PALETTE_TEXT_LENGTH ||
    ids.has(entryId) ||
    typeof position !== 'number' ||
    !Number.isFinite(position) ||
    position < 0 ||
    position > 1 ||
    typeof a !== 'number' ||
    !Number.isFinite(a) ||
    Math.abs(a) > MAX_PALETTE_CHANNEL_MAGNITUDE ||
    typeof b !== 'number' ||
    !Number.isFinite(b) ||
    Math.abs(b) > MAX_PALETTE_CHANNEL_MAGNITUDE
  ) {
    return undefined
  }
  ids.add(entryId)
  return { id: entryId, position, a, b }
}

export function tryValidatePalette(value: unknown): Palette | undefined {
  const header = validatePaletteHeader(value)
  if (!header) return undefined

  const ids = new Set<string>()
  const validatedEntries: Palette['entries'] = []
  for (const rawEntry of header.entries) {
    const entry = validatePaletteEntry(rawEntry, ids)
    if (!entry) return undefined
    validatedEntries.push(entry)
  }

  return {
    id: header.id,
    name: header.name,
    source: header.source ?? 'custom',
    entries: validatedEntries,
    ...(header.createdAt === undefined ? {} : { createdAt: header.createdAt }),
  }
}

export function isAffineLike(
  affine: unknown,
): affine is Record<string, number> {
  if (affine === null || typeof affine !== 'object') return false
  const keys = Object.keys(affine)
  const expected =
    keys.length === AFFINE_3D_KEYS.length ? AFFINE_3D_KEYS : AFFINE_2D_KEYS
  if (keys.length !== expected.length) return false
  return expected.every((key) =>
    Number.isFinite((affine as Record<string, unknown>)[key]),
  )
}

export function normalizeTransformRef(
  ctx: CommandContext,
  ref: unknown,
): unknown {
  return resolveTransformKey(ctx.flameDescriptor().transforms, ref) ?? ref
}

export function normalizeVariationRef(
  ctx: CommandContext,
  transformRef: unknown,
  variationRef: unknown,
): unknown {
  const transforms = ctx.flameDescriptor().transforms
  const key = resolveTransformKey(transforms, transformRef)
  const transform = key ? transforms[key] : undefined
  if (!transform) return variationRef
  return resolveVariationKey(transform.variations, variationRef) ?? variationRef
}

export function resolveVariationType(
  ctx: CommandContext,
  variationType: unknown,
): string {
  const dims = (ctx.flameDescriptor().renderSettings.dimensions ?? 2) as Dims
  return typeof variationType === 'string'
    ? variationType
    : defaultLinearType(dims)
}

export function variationTypeMatchesCurrentFlame(
  ctx: CommandContext,
  variationType: unknown,
): variationType is string {
  const dims = (ctx.flameDescriptor().renderSettings.dimensions ?? 2) as Dims
  return (
    typeof variationType === 'string' && isVariationTypeFor(dims, variationType)
  )
}

export function isKnownVariationType(
  variationType: unknown,
): variationType is string {
  return (
    typeof variationType === 'string' &&
    (isVariationTypeFor(2, variationType) ||
      isVariationTypeFor(3, variationType))
  )
}

export function variationDescriptorType(
  descriptor: unknown,
): string | undefined {
  if (
    descriptor === null ||
    typeof descriptor !== 'object' ||
    Array.isArray(descriptor)
  ) {
    return undefined
  }
  const type = (descriptor as { type?: unknown }).type
  return typeof type === 'string' ? type : undefined
}

export function validatedVariationUpdate(
  ctx: CommandContext,
  transformRef: unknown,
  variationRef: unknown,
  descriptor: unknown,
  preAffine?: unknown,
) {
  const type = variationDescriptorType(descriptor)
  if (!type || !variationTypeMatchesCurrentFlame(ctx, type)) return undefined
  if (preAffine !== undefined && !isAffineLike(preAffine)) return undefined

  const candidate = deepClone(ctx.flameDescriptor())
  const transformId = resolveTransformKey(candidate.transforms, transformRef)
  if (!transformId) return undefined
  const transform = candidate.transforms[transformId]
  if (!transform) return undefined
  const variationId = resolveVariationKey(transform.variations, variationRef)
  if (!variationId) return undefined

  transform.variations[variationId] = deepClone(
    descriptor,
  ) as TransformFunction['variations'][VariationId]
  if (preAffine !== undefined) {
    transform.preAffine = deepClone(preAffine) as TransformFunction['preAffine']
  }

  const validated = tryValidateFlame(candidate)
  const validatedTransform = validated?.transforms[transformId]
  const validatedVariation = validatedTransform?.variations[variationId]
  if (!validatedTransform || !validatedVariation) return undefined
  return {
    transformId,
    variationId,
    variation: deepClone(validatedVariation),
    preAffine:
      preAffine === undefined
        ? undefined
        : deepClone(validatedTransform.preAffine),
  }
}

export function graphCounts(
  flame: FlameDescriptor,
  includeTransform: (transformId: string) => boolean = () => true,
) {
  let transformCount = 0
  let totalVariationCount = 0
  let largestVariationCount = 0
  for (const [transformId, transform] of Object.entries(flame.transforms)) {
    if (!includeTransform(transformId)) continue
    transformCount++
    const variationCount = Object.keys(transform.variations).length
    totalVariationCount += variationCount
    largestVariationCount = Math.max(largestVariationCount, variationCount)
  }
  return { transformCount, totalVariationCount, largestVariationCount }
}

export function canAddTransform(flame: FlameDescriptor): boolean {
  const counts = graphCounts(flame)
  return isFlameGraphWithinLimits(
    counts.transformCount + 1,
    counts.totalVariationCount + 1,
    Math.max(counts.largestVariationCount, 1),
  )
}

export function canAddVariation(
  flame: FlameDescriptor,
  transform: TransformFunction,
): boolean {
  const counts = graphCounts(flame)
  const variationCount = Object.keys(transform.variations).length
  return isFlameGraphWithinLimits(
    counts.transformCount,
    counts.totalVariationCount + 1,
    Math.max(counts.largestVariationCount, variationCount + 1),
  )
}

export function resolveNewTransformId(transformId: unknown): TransformId {
  return (
    typeof transformId === 'string' && transformId !== ''
      ? transformId
      : generateTransformId()
  ) as TransformId
}

export function resolveNewVariationId(variationId: unknown): VariationId {
  return (
    typeof variationId === 'string' && variationId !== ''
      ? variationId
      : generateVariationId()
  ) as VariationId
}

export const MAX_SYMMETRY_FOLDS = 64
export type SymmetryControlOrigin = 'add' | 'type' | 'folds'

export function isSymmetryControlOrigin(
  value: unknown,
): value is SymmetryControlOrigin {
  return value === 'add' || value === 'type' || value === 'folds'
}

export function symmetryTransformCount(n: unknown, type: unknown): number {
  const folds =
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= MAX_SYMMETRY_FOLDS
      ? n
      : 0
  if (folds === 0) return type === 'dihedral' ? 1 : 0
  return folds - 1 + (type === 'dihedral' ? 1 : 0)
}

function validateSymmetryHeader(
  n: unknown,
  type: unknown,
  origin: unknown,
  hasOrigin: boolean,
): string | undefined {
  if (
    typeof n !== 'number' ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > MAX_SYMMETRY_FOLDS
  ) {
    return `fold count must be an integer from 1 to ${MAX_SYMMETRY_FOLDS}`
  }
  if (type !== 'rotational' && type !== 'dihedral') {
    return 'symmetry type must be rotational or dihedral'
  }
  if (hasOrigin && !isSymmetryControlOrigin(origin)) {
    return 'symmetry control origin must be add, type, or folds'
  }
  return undefined
}

function validateSymmetryPair(
  pair: unknown,
): { transformId: string; variationId: string } | string {
  if (!Array.isArray(pair) || pair.length !== 2) {
    return 'each symmetry id pair must contain exactly two ids'
  }
  const [transformId, variationId] = pair
  if (
    !isSafeFlameEntityId(transformId) ||
    !transformId.startsWith('_sym__') ||
    transformId.length === '_sym__'.length
  ) {
    return 'symmetry transform ids must use the reserved _sym__ prefix'
  }
  if (!isSafeFlameEntityId(variationId)) {
    return 'symmetry variation ids are unsafe'
  }
  return { transformId, variationId }
}

function validateSymmetryIds(
  ids: unknown,
  expectedCount: number,
): string | undefined {
  if (!Array.isArray(ids) || ids.length !== expectedCount) {
    return 'symmetry transform ids do not match the fold count'
  }

  const transformIds: string[] = []
  const variationIds: string[] = []
  for (const rawPair of ids) {
    const validated = validateSymmetryPair(rawPair)
    if (typeof validated === 'string') return validated
    transformIds.push(validated.transformId)
    variationIds.push(validated.variationId)
  }

  if (
    new Set(transformIds).size !== transformIds.length ||
    new Set(variationIds).size !== variationIds.length
  ) {
    return 'symmetry transform and variation ids must be unique'
  }
  return undefined
}

export function symmetryArgsError(
  args: readonly unknown[],
): string | undefined {
  if (args.length !== 3 && args.length !== 4) {
    return 'symmetry expects three arguments and an optional control origin'
  }
  const [n, type, ids, origin] = args
  const headerError = validateSymmetryHeader(n, type, origin, args.length === 4)
  if (headerError) return headerError

  const count = symmetryTransformCount(n, type)
  return validateSymmetryIds(ids, count)
}
