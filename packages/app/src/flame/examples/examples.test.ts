import { describe, expect, it } from 'vitest'
import * as v from '@/valibot'
import { FlameDescriptor, FlameDescriptor3D } from '../schema/flameSchema'
import { examples } from './index'

/**
 * Every built-in example must validate against its dimension-appropriate schema,
 * exactly as it would when re-loaded from an exported PNG. 3D flames are strict:
 * all affines (preAffine/postAffine + finalTransform) must carry 12 params
 * (a–l). This guards against shipping an example that can't be re-imported.
 */
describe('example flames are export/load-valid', () => {
  for (const [name, flame] of Object.entries(examples)) {
    it(`${name} validates against its schema`, () => {
      const data = JSON.parse(JSON.stringify(flame)) as {
        renderSettings?: { dimensions?: number }
      }
      const is3D = data.renderSettings?.dimensions === 3
      const schema = is3D ? FlameDescriptor3D : FlameDescriptor
      const result = v.safeParse(schema, data)
      const detail = result.success
        ? ''
        : JSON.stringify(v.flatten(result.issues).nested, null, 2)
      expect(
        result.success,
        `${name} (${is3D ? '3D' : '2D'}):\n${detail}`,
      ).toBe(true)
    })
  }
})
