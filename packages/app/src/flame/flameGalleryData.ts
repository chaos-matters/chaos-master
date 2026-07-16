import { example1 } from '@/flame/examples/example1'
import { example10 } from '@/flame/examples/example10'
import { example15 } from '@/flame/examples/example15'
import { example20 } from '@/flame/examples/example20'
import { deepClone } from '@/utils/clone'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface GalleryEntry {
  id: string
  name: string
  description: string
  /** Tags for filtering (variation names, styles) */
  tags: string[]
  /**
   * 'xml' → parse via parseFlameXml at load time.
   * 'native' → already a FlameDescriptor (deep-cloned on load).
   */
  source: 'xml' | 'native'
  /** The .flame XML content (source === 'xml') */
  xml?: string
  /** Pre-built FlameDescriptor (source === 'native') */
  descriptor?: FlameDescriptor
}

// ── Classic .flame XML examples ──────────────────────────────────────────

const SWIRL_GALAXY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame version="Apophysis 2.09" name="Swirl Galaxy" size="800 600"
  center="0 0" scale="200" oversample="1" filter="0.5" quality="100"
  background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="0.5" color="0.1" swirl="1" coefs="0.8 -0.2 0 0.2 0.8 0"/>
  <xform weight="0.5" color="0.6" linear="1" coefs="0.3 0 0 0 0.3 0"/>
  <palette count="256" format="RGB">
    FF0000FF0A00FF1500FF1F00FF2A00FF3400FF3F00FF4900
    FF5400FF5E00FF6900FF7300FF7E00FF8800FF9200FF9D00
  </palette>
</flame>`

const BUBBLE_CHAMBER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame version="Apophysis 2.09" name="Bubble Chamber"
  size="800 600" center="0 -0.1" scale="180" oversample="1"
  filter="0.5" quality="100" background="0.02 0.01 0.05"
  brightness="3.5" gamma="2.2">
  <xform weight="0.6" color="0" spherical="1"
    coefs="0.5 0 0 0 0.5 0"/>
  <xform weight="0.4" color="0.7" pre_blur="1"
    coefs="-0.3 0 0 0 -0.3 0"/>
  <palette count="256" format="RGB">
    00004000004A00005500005F00006A00007400007F000089
    00009400009E0000A90000B30000BE0000C80000D20000DD
  </palette>
</flame>`

const JULIA_DREAMS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame version="Apophysis 2.09" name="Julia Dreams"
  size="800 600" center="0 0" scale="160" oversample="1"
  filter="0.5" quality="100" background="0 0 0"
  brightness="5" gamma="2.2">
  <xform weight="0.5" color="0" julia="1" julia_power="3"
    coefs="0.6 0 0 0 0.6 0"/>
  <xform weight="0.5" color="0.5" linear="1"
    coefs="0.4 0.1 0.05 -0.1 0.4 0.1"/>
  <palette count="256" format="RGB">
    FFAA00FFB400FFBE00FFC800FFD200FFDC00FFE600FFF000
    FFFA00F5FF00EBFF00E0FF00D6FF00CCFF00C2FF00B8FF00
  </palette>
</flame>`

const DIAMOND_LATTICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame version="Apophysis 2.09" name="Diamond Lattice"
  size="800 600" center="0 0" scale="220" oversample="1"
  filter="0.5" quality="100" background="0 0 0.05"
  brightness="4.5" gamma="2.2">
  <xform weight="0.4" color="0" linear="1"
    coefs="0.7 0.15 0.1 -0.15 0.7 0.15"/>
  <xform weight="0.3" color="0.4" pdj="1"
    coefs="0.5 -0.2 0 0.2 0.5 0.1" pdj_a="1.2" pdj_b="0.8"
    pdj_c="-0.6" pdj_d="0.3"/>
  <xform weight="0.3" color="0.7" julia="1" julia_power="2"
    coefs="-0.4 0 0 0 -0.4 0"/>
  <palette count="256" format="RGB">
    FFFFFFEEEEFFDDDDFFCCCCFFBBBBFFAAAAFF9999FF8888FF
    7777FF6666FF5555FF4444FF3333FF2222FF1111FF0000FF
  </palette>
</flame>`

const HORSESHOE_NEBULA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame version="Apophysis 2.09" name="Horseshoe Nebula"
  size="800 600" center="0.05 0" scale="190" oversample="1"
  filter="0.5" quality="100" background="0.01 0 0.02"
  brightness="6" gamma="2.2">
  <xform weight="0.5" color="0" horseshoe="1"
    coefs="0.55 0.1 0.05 -0.1 0.55 0"/>
  <xform weight="0.3" color="0.5" spherical="1"
    coefs="0.3 0 0 0 0.3 0.05"/>
  <xform weight="0.2" color="0.8" linear="1"
    coefs="0.2 -0.05 -0.1 0.05 0.2 0.08"/>
  <palette count="256" format="RGB">
    2A00402E004A32005536005F3A006A3E007442007F460089
    4A00944E009E5200A95600B35A00BE5E00C86200D26600DD
  </palette>
</flame>`

const FIRE_SPINNER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame version="Apophysis 2.09" name="Fire Spinner"
  size="800 600" center="0 -0.05" scale="170" oversample="1"
  filter="0.5" quality="100" background="0.05 0 0"
  brightness="4.5" gamma="2.0">
  <xform weight="0.45" color="0" blur="1"
    coefs="0.5 0 0 0 0.5 0.05"/>
  <xform weight="0.3" color="0.4" spherical="1"
    coefs="0.35 0.05 0 -0.05 0.35 0"/>
  <xform weight="0.25" color="0.75" swirl="1"
    coefs="-0.25 0.1 0 -0.1 -0.25 0.1"/>
  <palette count="256" format="RGB">
    FF0000FF1A00FF3300FF4D00FF6600FF8000FF9900FFB300
    FFCC00FFE600FFFF00FFF200FFE600FFD900FFCC00FFBF00
  </palette>
</flame>`

const RINGS_OF_SATURN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame version="Apophysis 2.09" name="Rings of Saturn"
  size="800 600" center="0 0" scale="240" oversample="1"
  filter="0.5" quality="100" background="0 0.02 0.05"
  brightness="3.5" gamma="2.2">
  <xform weight="0.5" color="0" disc="1"
    coefs="0.65 0 0 0 0.2 0"/>
  <xform weight="0.3" color="0.45" julia="1" julia_power="5"
    coefs="0.3 -0.05 0 0.05 0.3 0"/>
  <xform weight="0.2" color="0.8" linear="1"
    coefs="0.25 0 0.1 0 0.25 0.05"/>
  <palette count="256" format="RGB">
    0033660044770055880066990077AA0088BB0099CC00AADD
    00BBEE00CCFF00DDFF00EEFF00FFFF0FFFFF1FFFFF2FFFFF
  </palette>
</flame>`

const POLAR_COORDINATES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame version="Apophysis 2.09" name="Polar Coordinates"
  size="800 600" center="0 0" scale="200" oversample="1"
  filter="0.5" quality="100" background="0 0 0"
  brightness="5" gamma="2.2">
  <xform weight="0.55" color="0" polar="1"
    coefs="0.6 0 0 0 0.6 0"/>
  <xform weight="0.25" color="0.45" waves2="1"
    coefs="0.3 0.1 0 -0.1 0.3 0.05"
    waves2_scalex="0.8" waves2_scaley="0.4"
    waves2_freqx="2" waves2_freqy="1.5"/>
  <xform weight="0.2" color="0.8" linear="1"
    coefs="-0.2 0 0.05 0 -0.2 0.1"/>
  <palette count="256" format="RGB">
    4400884D009A5500AA5E00BB6600CC6E00DD7700EE8800FF
    9900FFAA00FFBB00FFCC00FFDD00FFEE00FFFF00FFEE00EE
  </palette>
</flame>`

const WAVES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame version="Apophysis 2.09" name="Waves"
  size="800 600" center="0 0" scale="210" oversample="1"
  filter="0.5" quality="100" background="0.02 0.04 0.1"
  brightness="4" gamma="2.2">
  <xform weight="0.4" color="0" sinusoidal="1"
    coefs="0.5 0 0 0 0.5 0.05"/>
  <xform weight="0.3" color="0.35" waves2="1"
    coefs="0.35 -0.1 0 0.1 0.35 0"
    waves2_scalex="1.2" waves2_scaley="0.6"
    waves2_freqx="1.5" waves2_freqy="2"/>
  <xform weight="0.3" color="0.7" linear="1"
    coefs="0.25 0.05 -0.1 -0.05 0.25 0.08"/>
  <palette count="256" format="RGB">
    0011330022550033770044990055BB0066DD0077EE0088FF
    99AAFFAACCFFBBEEFFCCFFFFDDFFFFEEFFFFFFEEFFFFDDFF
  </palette>
</flame>`

const CLASSIC_SINUSOIDAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame version="Apophysis 2.09" name="Classic Sinusoidal"
  size="800 600" center="0 -0.1" scale="150" oversample="1"
  filter="0.5" quality="100" background="0.03 0.02 0.08"
  brightness="3.8" gamma="2.2">
  <xform weight="0.45" color="0.1" sinusoidal="1"
    coefs="0.55 0.15 0.08 -0.15 0.55 0.1"/>
  <xform weight="0.3" color="0.5" spherical="1"
    coefs="0.3 -0.05 0 0.05 0.3 0"/>
  <xform weight="0.25" color="0.8" linear="1"
    coefs="0.2 0 0.05 0 0.2 0.08"/>
  <palette count="256" format="RGB">
    1A0A2A24103A2E164A381C5A42226A4C2774542F7F5E3589
    683594723D9E7C45A9864DB39055BE9A5DC8A466DDAE6EE2
  </palette>
</flame>`

// ── Native FlameDescriptor examples ──────────────────────────────────────

function tagged(
  name: string,
  description: string,
  tags: string[],
  descriptor: FlameDescriptor,
): GalleryEntry {
  const clone = deepClone(descriptor)
  clone.metadata = { ...clone.metadata, name, description }
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    description,
    tags,
    source: 'native',
    descriptor: clone,
  }
}

const NATIVE_ENTRIES: GalleryEntry[] = [
  tagged(
    'Linear Swirl',
    'Clean spiral with linear + swirl variations',
    ['linear', 'swirl', 'spiral'],
    example1,
  ),
  tagged(
    'Cosmic Tendrils',
    'Organic tendril-like structures with complex affine transforms',
    ['linear', 'spherical', 'tendrils'],
    example10,
  ),
  tagged(
    'Crystalline Web',
    'Sharp angular structures with high-contrast coloring',
    ['linear', 'julia', 'crystal'],
    example15,
  ),
  tagged(
    'Nebula Burst',
    'Explosive burst pattern with rich color gradients',
    ['linear', 'spherical', 'burst', 'nebula'],
    example20,
  ),
]

// ── XML entries ──────────────────────────────────────────────────────────

const XML_ENTRIES: GalleryEntry[] = [
  {
    id: 'swirl-galaxy',
    name: 'Swirl Galaxy',
    description: 'Spiral galaxy formed by nested swirl transforms',
    tags: ['swirl', 'galaxy', 'spiral'],
    source: 'xml',
    xml: SWIRL_GALAXY_XML,
  },
  {
    id: 'bubble-chamber',
    name: 'Bubble Chamber',
    description: 'Translucent spheres with a particle-physics feel',
    tags: ['spherical', 'blur', 'bubbles', 'transparent'],
    source: 'xml',
    xml: BUBBLE_CHAMBER_XML,
  },
  {
    id: 'julia-dreams',
    name: 'Julia Dreams',
    description: 'Classic Julia-set inspired recursive patterns',
    tags: ['julia', 'fractal', 'recursive'],
    source: 'xml',
    xml: JULIA_DREAMS_XML,
  },
  {
    id: 'diamond-lattice',
    name: 'Diamond Lattice',
    description: 'Crystalline grid formed by pdj + julia transforms',
    tags: ['pdj', 'julia', 'crystal', 'lattice'],
    source: 'xml',
    xml: DIAMOND_LATTICE_XML,
  },
  {
    id: 'horseshoe-nebula',
    name: 'Horseshoe Nebula',
    description: 'Cosmic nebula with horseshoe variation arcs',
    tags: ['horseshoe', 'nebula', 'spherical', 'cosmic'],
    source: 'xml',
    xml: HORSESHOE_NEBULA_XML,
  },
  {
    id: 'fire-spinner',
    name: 'Fire Spinner',
    description: 'Flame-like tendrils with blur + spherical blending',
    tags: ['blur', 'spherical', 'swirl', 'fire'],
    source: 'xml',
    xml: FIRE_SPINNER_XML,
  },
  {
    id: 'rings-of-saturn',
    name: 'Rings of Saturn',
    description: 'Planetary rings with disc + julia variations',
    tags: ['disc', 'julia', 'rings', 'planet'],
    source: 'xml',
    xml: RINGS_OF_SATURN_XML,
  },
  {
    id: 'polar-coordinates',
    name: 'Polar Coordinates',
    description: 'Circular patterns from polar mapping + waves',
    tags: ['polar', 'waves2', 'circular'],
    source: 'xml',
    xml: POLAR_COORDINATES_XML,
  },
  {
    id: 'waves',
    name: 'Waves',
    description: 'Ocean-like undulating patterns',
    tags: ['sinusoidal', 'waves2', 'ocean', 'waves'],
    source: 'xml',
    xml: WAVES_XML,
  },
  {
    id: 'classic-sinusoidal',
    name: 'Classic Sinusoidal',
    description: 'Gentle sine-wave dreamy cloud formations',
    tags: ['sinusoidal', 'spherical', 'clouds', 'classic'],
    source: 'xml',
    xml: CLASSIC_SINUSOIDAL_XML,
  },
]

// ── Combined gallery ─────────────────────────────────────────────────────

export const FLAME_GALLERY: GalleryEntry[] = [...XML_ENTRIES, ...NATIVE_ENTRIES]

export function getGalleryEntryById(id: string): GalleryEntry | undefined {
  return FLAME_GALLERY.find((e) => e.id === id)
}
