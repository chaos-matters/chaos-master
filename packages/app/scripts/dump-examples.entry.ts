// Entry point for the gallery seeder: imports the curated example flames and
// the built-in animations, then prints them as JSON so seeding can run in plain
// node with no browser and no GPU. Bundled by esbuild (see seed-gallery.mjs).
import { animationDefs, getAnimationFlame } from '@/flame/examples/animations'
import { example1 } from '@/flame/examples/example1'
import { example14 } from '@/flame/examples/example14'
import { example21 } from '@/flame/examples/example21'
import { example22 } from '@/flame/examples/example22'
import { example29 } from '@/flame/examples/example29'
import { example33 } from '@/flame/examples/example33'
import { example34 } from '@/flame/examples/example34'
import { example40 } from '@/flame/examples/example40'
import { example44 } from '@/flame/examples/example44'
import { example45 } from '@/flame/examples/example45'
import { example46 } from '@/flame/examples/example46'

const flames = {
  example1,
  example14,
  example21,
  example22,
  example29,
  example33,
  example34,
  example40,
  example44,
  example45,
  example46,
}

// Each animation resolves to a full flame plus its timeline tracks, which is
// exactly the `{flame, animation}` envelope the gallery rows store.
const animations = animationDefs.map((def) => ({
  id: def.id,
  name: def.name,
  description: def.description,
  exampleId: def.exampleId,
  flame: getAnimationFlame(def),
  tracks: def.tracks,
}))

process.stdout.write(JSON.stringify({ flames, animations }))
