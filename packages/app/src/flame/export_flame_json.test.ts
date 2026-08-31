import fs from 'fs'
import { describe, it } from 'vitest'
import { parseFlameXml } from './flameXml'

const f1 = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Neon Julian Cosmos" version="Apophysis 7X" size="1920 1080"
       center="0 0" scale="400" oversample="1" filter="0.5"
       quality="1000" background="0 0 0" brightness="8" gamma="2.2">
  <xform weight="0.5" color="0" julian="1" julian_power="5" julian_dist="1"
         coefs="0.8 -0.4 0.4 0.8 0 0"/>
  <xform weight="0.5" color="0.4" linear="0.2" spherical="0.6" swirl="0.2"
         coefs="0.6 0 0 0.6 0.3 -0.3"/>
  <xform weight="0.5" color="0.8" linear="0.1" horseshoe="0.9"
         coefs="0.5 -0.1 0.1 0.5 -0.5 0.5"/>
  <finalxform color="0" linear="1" coefs="1 0 0 1 0 0"/>
  <palette count="16" format="RGB">
    000000 000a1a 001433 002966 003d99 0052cc 0066ff 3385ff
    66a3ff 99c2ff cce0ff e6f0ff f2f8ff ffffff ffffaa ffcc00
  </palette>
</flame>`

const f2 = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Golden Apollonian Gasket" version="Apophysis 7X" size="1920 1080"
       center="0 0" scale="350" oversample="1" filter="0.5"
       quality="1000" background="0 0 0" brightness="8" gamma="2.2">
  <xform weight="1.0" color="0.1" spherical="1" coefs="0.5 0.0 0.0 0.5 0.5 0.5"/>
  <xform weight="1.0" color="0.4" spherical="1" coefs="0.5 0.0 0.0 0.5 -0.5 0.5"/>
  <xform weight="1.0" color="0.7" spherical="1" coefs="0.5 0.0 0.0 0.5 0 -0.5"/>
  <palette count="16" format="RGB">
    000000 1a0f00 331f00 4d2e00 663d00 804d00 995c00 b36b00
    cc7a00 e68a00 ff9900 ffa31a ffad33 ffb84d ffc266 ffff99
  </palette>
</flame>`

const f3 = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Cybernetic Swirl" version="Apophysis 7X" size="1920 1080"
       center="0 0" scale="250" oversample="1" filter="0.5"
       quality="1000" background="0 0 0" brightness="7" gamma="2.2">
  <xform weight="0.5" color="0.2" swirl="1" linear="0.5" coefs="0.8 -0.6 0.6 0.8 0 0"/>
  <xform weight="0.5" color="0.8" eyefish="0.5" linear="0.5" coefs="0.5 0 0 0.5 0.2 -0.2"/>
  <palette count="16" format="RGB">
    000000 001a1a 003333 004d4d 006666 008080 009999 00b3b3
    00cccc 00e6e6 00ffff 33ffff 66ffff 99ffff ccffff ffffff
  </palette>
</flame>`

describe('export_flame_json', () => {
  it('should export flame to JSON', () => {
    fs.writeFileSync(
      '../../marketing_neon_julian.json',
      JSON.stringify(parseFlameXml(f1), null, 2),
    )
    fs.writeFileSync(
      '../../marketing_golden_apollonian.json',
      JSON.stringify(parseFlameXml(f2), null, 2),
    )
    fs.writeFileSync(
      '../../marketing_cybernetic_swirl.json',
      JSON.stringify(parseFlameXml(f3), null, 2),
    )
  })
})
