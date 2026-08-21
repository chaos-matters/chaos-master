import { describe, expect, it } from 'vitest'
import { validateFlame } from '../schema/flameSchema'
import { cyberneticSwirl } from './cyberneticSwirl'
import { goldenApollonianGasket } from './goldenApollonianGasket'
import { neonJulianCosmos } from './neonJulianCosmos'

const marketingFlames = [
  neonJulianCosmos,
  goldenApollonianGasket,
  cyberneticSwirl,
]

describe('marketing flames', () => {
  it.each(marketingFlames)('validates $metadata.name', (flame) => {
    const validated = validateFlame(flame)

    expect(validated.metadata?.author).toBe('Lumen Apeiron')
    expect(validated.metadata?.description).not.toMatch(/imported from/i)
    expect(Object.keys(validated.transforms)).not.toHaveLength(0)
  })
})
