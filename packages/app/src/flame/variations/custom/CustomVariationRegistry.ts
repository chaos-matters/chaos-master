import * as v from '@/valibot'
import { transformVariations, variationTypes } from '../index'
import { compileCustomVariationCode } from './runtimeCompiler'
import type { TgpuFn } from 'typegpu'
import type { CompileError } from './runtimeCompiler'
import type { CustomVariationDef } from './types'

const STORAGE_KEY = 'chaos-master-custom-variations'
const CUSTOM_TYPE_PREFIX = 'custom_'

let cacheVersion = 0

function generateId(): string {
  return `${CUSTOM_TYPE_PREFIX}${window.crypto
    .randomUUID()
    .replaceAll('-', '_')}`
}

const customVariationRecords: Record<
  string,
  {
    def: CustomVariationDef
    DescriptorSchema: ReturnType<typeof makeDescriptorSchema>
    fn?: TgpuFn
  }
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
