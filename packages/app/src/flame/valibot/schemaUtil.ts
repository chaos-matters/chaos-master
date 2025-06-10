import { f32, struct } from 'typegpu/data'

export function schemaToF32Struct<T extends Record<string, unknown>>(
  schema: T,
) {
  const obj = {} as Record<keyof T, typeof f32>
  for (const key of Object.keys(schema) as (keyof T)[]) {
    obj[key] = f32
  }
  return struct(obj)
}
// function createF32Struct<T extends Record<string, unknown>>(keys: (keyof T)[]) {
//   // We build a typed object where keys are preserved as literals
//   const obj = {} as Record<keyof T, typeof f32>
//   for (const key of keys) {
//     obj[key] = f32
//   }
//   return struct(obj)
// }
