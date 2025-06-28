import { f32, struct } from 'typegpu/data'
import { recordKeys } from '@/utils/record'

export function schemaToF32Struct<T extends Record<string, unknown>>(
  schema: T,
) {
  const obj = {} as Record<keyof T, typeof f32>
  for (const key of recordKeys(schema)) {
    obj[key] = f32
  }
  return struct(obj)
}
