import * as v from '@/valibot'
import { transformVariations, variationTypes } from '../index'
import { compileCustomVariationCode } from './runtimeCompiler'
import type { TgpuFn } from 'typegpu'
import type { CompileError } from './runtimeCompiler'
import type { CustomVariationDef } from './types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const STORAGE_KEY = 'chaos-master-custom-variations'
const CUSTOM_TYPE_PREFIX = 'custom_'

let cacheVersion = 0

function generateId(): string {
  return `${CUSTOM_TYPE_PREFIX}${window.crypto
    .randomUUID()
    .replaceAll('-', '_')}`
}

/** Mint a fresh `custom_<uuid>` id — e.g. to share an unsaved variation. */
export function generateCustomVariationId(): string {
  return generateId()
}

const customVariationRecords: Record<
  string,
  {
    def: CustomVariationDef
    DescriptorSchema: ReturnType<typeof makeDescriptorSchema>
    fn?: TgpuFn
  }
> = {}

/**
 * Custom variations pulled in from a shared link. They are compiled and added
 * to the global registry so the shared flame renders, but deliberately kept out
 * of `customVariationRecords` (and therefore out of the saved library and
 * localStorage) until the recipient explicitly accepts them. This is the
 * consent boundary: a stranger's link can render its variations for this
 * session, but never silently pollutes the user's permanent library.
 */
const transientSharedRecords: Record<
  string,
  { def: CustomVariationDef; fn: TgpuFn }
> = {}

function makeDescriptorSchema(type: string) {
  return v.object({
    type: v.literal(type),
    weight: v.number(),
    visible: v.optional(v.boolean(), true),
  })
}

export function getCustomVariationDef(
  id: string,
): CustomVariationDef | undefined {
  return customVariationRecords[id]?.def
}

export function getCustomVariations(): CustomVariationDef[] {
  return Object.values(customVariationRecords).map((r) => r.def)
}

/**
 * Whether a custom variation id is currently live in the global registry with a
 * compiled fn — i.e. it actually renders. False once it's been deleted from the
 * library (or never imported), so a flame still referencing it can be flagged as
 * unavailable in the UI.
 */
export function isCustomVariationRegistered(id: string): boolean {
  const rec = (
    transformVariations as Record<string, { fn?: unknown } | undefined>
  )[id]
  return !!rec?.fn
}

export function getCacheVersion(): number {
  return cacheVersion
}

function persist() {
  const store = {
    version: 1,
    variations: Object.fromEntries(
      Object.entries(customVariationRecords).map(([id, r]) => [id, r.def]),
    ),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

function addToGlobal(def: CustomVariationDef, fn: TgpuFn) {
  const schema = makeDescriptorSchema(def.id)
  ;(transformVariations as Record<string, unknown>)[def.id] = {
    DescriptorSchema: schema,
    fn,
    category: 'custom',
  }
  if (!variationTypes.includes(def.id)) {
    variationTypes.push(def.id)
  }
}

function removeFromGlobal(id: string) {
  delete (transformVariations as Record<string, unknown>)[id]
  const idx = variationTypes.indexOf(id)
  if (idx !== -1) variationTypes.splice(idx, 1)
}

function register(def: CustomVariationDef, fn?: TgpuFn, skipPersist = false) {
  customVariationRecords[def.id] = {
    def,
    DescriptorSchema: makeDescriptorSchema(def.id),
    fn,
  }
  if (fn) {
    addToGlobal(def, fn)
  }
  cacheVersion++
  if (!skipPersist) {
    persist()
  }
}

function unregister(id: string): boolean {
  const record = customVariationRecords[id]
  if (!record) return false
  delete customVariationRecords[id]
  removeFromGlobal(id)
  cacheVersion++
  persist()
  return true
}

export type RegisterResult =
  | { success: true; def: CustomVariationDef }
  | { success: false; errors: CompileError[] }

export function createCustomVariation(
  name: string,
  wgslBody: string,
): RegisterResult {
  const compileResult = compileCustomVariationCode(wgslBody)
  if (!compileResult.valid) {
    return { success: false, errors: compileResult.errors }
  }

  const id = generateId()
  const now = Date.now()
  const def: CustomVariationDef = {
    id,
    name,
    wgsl: wgslBody,
    createdAt: now,
    updatedAt: now,
  }
  register(def, compileResult.fn)
  return { success: true, def }
}

export type UpdateResult =
  | { success: true; def: CustomVariationDef }
  | { success: false; errors: CompileError[] }

export function updateCustomVariation(
  id: string,
  wgslBody: string,
  name?: string,
): UpdateResult {
  const record = customVariationRecords[id]
  if (!record) {
    return {
      success: false,
      errors: [{ message: 'Custom variation not found' }],
    }
  }

  const compileResult = compileCustomVariationCode(wgslBody)
  if (!compileResult.valid) {
    return { success: false, errors: compileResult.errors }
  }

  const def: CustomVariationDef = {
    ...record.def,
    name: name ?? record.def.name,
    wgsl: wgslBody,
    updatedAt: Date.now(),
  }
  removeFromGlobal(id)
  register(def, compileResult.fn)
  return { success: true, def }
}

export function duplicateCustomVariation(id: string): RegisterResult {
  const record = customVariationRecords[id]
  if (!record) {
    return {
      success: false,
      errors: [{ message: 'Custom variation not found' }],
    }
  }
  const newId = generateId()
  const now = Date.now()
  const def: CustomVariationDef = {
    id: newId,
    name: `${record.def.name} (copy)`,
    wgsl: record.def.wgsl,
    createdAt: now,
    updatedAt: now,
  }
  const compileResult = compileCustomVariationCode(def.wgsl)
  if (!compileResult.valid) {
    return { success: false, errors: compileResult.errors }
  }
  register(def, compileResult.fn)
  return { success: true, def }
}

export function deleteCustomVariation(id: string): boolean {
  return unregister(id)
}

/** Compile and temporarily register for live preview. Returns cleanup function. */
export function previewCustomVariation(
  wgslBody: string,
):
  | { valid: false; errors: CompileError[] }
  | { valid: true; id: string; unregister: () => void } {
  const compileResult = compileCustomVariationCode(wgslBody)
  if (!compileResult.valid) {
    return { valid: false, errors: compileResult.errors }
  }

  const id = `${CUSTOM_TYPE_PREFIX}preview_${window.crypto
    .randomUUID()
    .replaceAll('-', '_')}`

  const schema = makeDescriptorSchema(id)
  ;(transformVariations as Record<string, unknown>)[id] = {
    DescriptorSchema: schema,
    fn: compileResult.fn,
    category: 'custom',
  }
  if (!variationTypes.includes(id)) {
    variationTypes.push(id)
  }

  return {
    valid: true,
    id,
    unregister: () => {
      delete (transformVariations as Record<string, unknown>)[id]
      const idx = variationTypes.indexOf(id)
      if (idx !== -1) variationTypes.splice(idx, 1)
    },
  }
}

/** Load persisted custom variations from localStorage. Call once on app init. */
export function loadCustomVariations(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const store = JSON.parse(raw) as Record<string, unknown>
    if (!store?.variations) return
    for (const def of Object.values(store.variations) as CustomVariationDef[]) {
      if (!def.id || !def.wgsl || !def.name || typeof def.name !== 'string')
        continue
      if (!def.id.startsWith(CUSTOM_TYPE_PREFIX)) continue
      const compileResult = compileCustomVariationCode(def.wgsl)
      if (!compileResult.valid) {
        console.warn(
          `[CustomVariationRegistry] Failed to compile "${def.name}" (${def.id}):`,
          compileResult.errors.map((e) => e.message).join(', '),
        )
        register(def, undefined, true)
      } else {
        register(def, compileResult.fn, true)
      }
    }
    persist() // Save once after loading all
  } catch (err) {
    console.warn(
      '[CustomVariationRegistry] Failed to load custom variations:',
      err,
    )
  }
}

export function clearAllCustomVariations(): void {
  const ids = Object.keys(customVariationRecords)
  for (const id of ids) {
    unregister(id)
  }
}

// ── Sharing: collect / import / persist ──────────────────────────────────────

function lookupDef(id: string): CustomVariationDef | undefined {
  return customVariationRecords[id]?.def ?? transientSharedRecords[id]?.def
}

/** Variation `type` ids referenced by a flame that are custom variations. */
function flameCustomVariationIds(flame: FlameDescriptor): string[] {
  const ids = new Set<string>()
  const transforms = flame.transforms as
    | Record<string, { variations?: Record<string, { type?: unknown }> }>
    | undefined
  for (const transform of Object.values(transforms ?? {})) {
    for (const variation of Object.values(transform.variations ?? {})) {
      const type = variation.type
      if (typeof type === 'string' && type.startsWith(CUSTOM_TYPE_PREFIX)) {
        ids.add(type)
      }
    }
  }
  return [...ids]
}

/**
 * Resolve the full definitions of every custom variation a flame references, so
 * they can be embedded in a share link. Looks in both the saved library and the
 * transient (shared-but-not-saved) set, so re-sharing a received flame keeps its
 * variations. Ids with no known definition are silently skipped.
 */
export function collectFlameCustomVariations(
  flame: FlameDescriptor,
): CustomVariationDef[] {
  return flameCustomVariationIds(flame)
    .map((id) => lookupDef(id))
    .filter((def): def is CustomVariationDef => def !== undefined)
}

export type SharedImportResult = {
  /** Newly registered (transient) variations to offer the recipient to save. */
  imported: CustomVariationDef[]
  /**
   * Shared variations whose code is identical to one already in the recipient's
   * saved library (matched by WGSL, regardless of id). Not imported — the flame
   * is pointed at the existing copy instead, so the user's version is never
   * duplicated or overwritten. Surfaced so the modal can say "already in your
   * library". Holds the existing (saved) defs.
   */
  alreadyOwned: CustomVariationDef[]
  /** Old id -> new id for variations re-keyed to avoid clobbering an existing one. */
  remap: Record<string, string>
  /** Variations that failed re-validation and were skipped. */
  rejected: { name: string; errors: CompileError[] }[]
}

/** A saved or transient variation whose code matches `wgsl`, if any. */
function findByWgsl(
  wgsl: string,
): { id: string; def: CustomVariationDef; saved: boolean } | undefined {
  for (const [id, record] of Object.entries(customVariationRecords)) {
    if (record.def.wgsl === wgsl) return { id, def: record.def, saved: true }
  }
  for (const [id, record] of Object.entries(transientSharedRecords)) {
    if (record.def.wgsl === wgsl) return { id, def: record.def, saved: false }
  }
  return undefined
}

function isValidSharedDefShape(def: unknown): def is CustomVariationDef {
  return (
    !!def &&
    typeof def === 'object' &&
    typeof (def as CustomVariationDef).id === 'string' &&
    typeof (def as CustomVariationDef).name === 'string' &&
    typeof (def as CustomVariationDef).wgsl === 'string'
  )
}

function registerTransient(def: CustomVariationDef, fn: TgpuFn) {
  transientSharedRecords[def.id] = { def, fn }
  addToGlobal(def, fn)
  cacheVersion++
}

/**
 * Re-validate and register custom variations that arrived inside a shared link.
 * Untrusted input: every definition is recompiled through the same allowlist
 * compiler used for locally-authored variations — the payload's own claims are
 * never trusted. Registration is transient (see {@link transientSharedRecords}).
 *
 * Collision handling: if the recipient already has a variation with the same id
 * but different code, the incoming one is given a fresh id and reported in
 * `remap` so the caller can rewrite the flame's references — neither version is
 * silently overwritten.
 */
export function importSharedVariations(
  defs: readonly unknown[],
): SharedImportResult {
  const imported: CustomVariationDef[] = []
  const alreadyOwned: CustomVariationDef[] = []
  const remap: Record<string, string> = {}
  const rejected: { name: string; errors: CompileError[] }[] = []

  for (const raw of defs) {
    if (!isValidSharedDefShape(raw)) {
      rejected.push({
        name: 'unknown',
        errors: [{ message: 'Malformed custom variation definition' }],
      })
      continue
    }
    const incoming = raw
    if (!incoming.id.startsWith(CUSTOM_TYPE_PREFIX)) {
      rejected.push({
        name: incoming.name,
        errors: [{ message: 'Invalid custom variation id' }],
      })
      continue
    }

    const compileResult = compileCustomVariationCode(incoming.wgsl)
    if (!compileResult.valid) {
      rejected.push({ name: incoming.name, errors: compileResult.errors })
      continue
    }

    // Identical code already present (saved or imported this session), matched by
    // WGSL regardless of id: don't duplicate. Point the flame at the existing
    // copy and, if it's saved, report it as already-owned. Never overwrite.
    const match = findByWgsl(incoming.wgsl)
    if (match) {
      if (match.id !== incoming.id) {
        remap[incoming.id] = match.id
      }
      if (match.saved && !alreadyOwned.some((d) => d.id === match.id)) {
        alreadyOwned.push(match.def)
      }
      continue
    }

    const now = Date.now()
    // Re-key on id collision (same id, different code) so we never clobber the
    // recipient's version.
    const idTaken = lookupDef(incoming.id) !== undefined
    const id = idTaken ? generateId() : incoming.id
    if (idTaken) {
      remap[incoming.id] = id
    }
    const def: CustomVariationDef = {
      id,
      name: incoming.name,
      wgsl: incoming.wgsl,
      createdAt: now,
      updatedAt: now,
    }
    registerTransient(def, compileResult.fn)
    imported.push(def)
  }

  return { imported, alreadyOwned, remap, rejected }
}

/**
 * Persist transient (shared) variations into the saved library after the
 * recipient accepts them. Ids not present in the transient set are ignored.
 */
export function persistSharedVariations(ids: readonly string[]): void {
  for (const id of ids) {
    const record = transientSharedRecords[id]
    if (!record) continue
    delete transientSharedRecords[id]
    register(record.def, record.fn) // moves into the saved library + persists
  }
}

/**
 * Rewrite a flame's custom-variation `type` references according to a remap
 * (old id -> new id) produced by {@link importSharedVariations}. Returns a new
 * flame; the input is not mutated. No-op when the remap is empty.
 */
export function remapFlameCustomVariations(
  flame: FlameDescriptor,
  remap: Record<string, string>,
): FlameDescriptor {
  if (Object.keys(remap).length === 0) return flame
  const clone = structuredClone(flame)
  const transforms = clone.transforms as Record<
    string,
    { variations?: Record<string, { type?: string }> }
  >
  for (const transform of Object.values(transforms ?? {})) {
    for (const variation of Object.values(transform.variations ?? {})) {
      if (typeof variation.type === 'string' && remap[variation.type]) {
        variation.type = remap[variation.type]!
      }
    }
  }
  return clone
}
