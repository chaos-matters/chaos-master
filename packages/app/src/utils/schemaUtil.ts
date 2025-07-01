import { recordKeys } from '@/utils/record'
import * as v from '@/valibot'
import type { BaseData, WgslStruct } from 'typegpu/data'

export function structToSchema<T extends Record<string, BaseData>>(
  struct: WgslStruct<T>,
) {
  const obj = {} as Record<keyof T, v.NumberSchema<undefined>>
  for (const key of recordKeys(struct.propTypes)) {
    obj[key] = v.number()
  }
  return v.object(obj)
}
