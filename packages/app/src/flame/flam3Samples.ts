/**
 * A small set of valid Apophysis/flam3 `.flame` files, bundled so the importer
 * (`parseFlameXml`) can be exercised end-to-end from the Migration toolbox — one
 * click loads a sample, validates, and previews it. They are hand-authored (not
 * copied third-party art) and deliberately cover the importer's tricky paths:
 *   - flam3 `coefs` order (`c00 c01 c10 c11 c20 c21`) → pre-variation affine,
 *   - a `post` affine,
 *   - additive multi-variation transforms,
 *   - registry-resolved names that aren't plain `name+Var` (`julian`, `pre_blur`,
 *     `pie`), and
 *   - both embedded-palette encodings (Apophysis hex text + `<color>` children).
 *
 * Parametric-variation parameters (for example `julian_power`) are included in
 * the samples because the importer preserves them alongside their variation.
 */
export type Flam3Sample = {
  name: string
  description: string
  xml: string
}

export const FLAM3_SAMPLES: Flam3Sample[] = [
  {
    name: 'Sierpinski',
    description:
      'The classic 3-map Sierpinski gasket — a known shape to sanity-check affine import.',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Sierpinski" version="Apophysis 7X" size="800 800"
       center="0.5 0.5" scale="380" oversample="1" filter="0.5"
       quality="200" background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0"   linear="1" coefs="0.5 0 0 0.5 0 0"/>
  <xform weight="1" color="0.5" linear="1" coefs="0.5 0 0 0.5 0.5 0"/>
  <xform weight="1" color="1"   linear="1" coefs="0.5 0 0 0.5 0.25 0.5"/>
  <palette count="3" format="RGB">ff3030 30ff60 4060ff</palette>
</flame>`,
  },
  {
    name: 'Spherical Bloom',
    description:
      'Linear + spherical + swirl with a post affine and a fire gradient (Apophysis hex-text palette).',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Spherical Bloom" version="Apophysis 7X" size="1024 768"
       center="0 0" scale="180" oversample="1" filter="0.5"
       quality="500" background="5 4 12" brightness="6" gamma="2.4">
  <xform weight="0.6" color="0.1" linear="0.3" spherical="0.7"
         coefs="0.6 0.4 -0.4 0.6 0 0"/>
  <xform weight="0.4" color="0.9" swirl="1"
         coefs="0.8 0 0 0.8 0.2 -0.1" post="1.1 0 0 1.1 0 0"/>
  <palette count="16" format="RGB">
    000000 1a0000 330000 4d0a00 661400 80200a 992d0d b33a10
    cc4d14 e06620 f08030 ffa040 ffbf60 ffd98c ffeebb ffffff
  </palette>
</flame>`,
  },
  {
    name: 'Julian Spiral',
    description:
      'julian (with power/dist params) + pre_blur and a spherical map, plus a finalxform — exercises parametric params, the final transform, and the <color> palette format.',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Julian Spiral" version="Apophysis 7X" size="1000 1000"
       center="0 0" scale="220" oversample="1" filter="0.5"
       quality="500" background="0 0 0" brightness="5" gamma="2.2">
  <xform weight="0.5" color="0.2" julian="1" julian_power="3" julian_dist="2"
         pre_blur="0.15" coefs="0.7 -0.3 0.3 0.7 0 0"/>
  <xform weight="0.5" color="0.8" linear="0.5" spherical="0.5" pie="0.2"
         coefs="0.5 0 0 0.5 0.4 0.2"/>
  <finalxform color="0" linear="1" coefs="0.95 0.31 -0.31 0.95 0 0"/>
  <palette>
    <color index="0" rgb="10 12 40"/>
    <color index="51" rgb="20 80 140"/>
    <color index="102" rgb="30 170 180"/>
    <color index="153" rgb="120 220 200"/>
    <color index="204" rgb="220 240 230"/>
    <color index="255" rgb="255 255 255"/>
  </palette>
</flame>`,
  },
]
