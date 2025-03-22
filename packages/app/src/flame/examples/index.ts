import { FlameFunction } from '../flameFunction'
import { empty } from './empty'
import { example1 } from './example1'
import { varTest } from '@/flame/examples/varTest'
import { blobFlame } from '@/flame/examples/blobFlame'
import { pdjFlame } from './pdjFlame'
import { fan2Flame } from './fan2'
import { juliaNFlame } from './juliaNFlame'
import { perspectiveFlame } from './perspectiveFlame'
import { juliaNScopeFlame } from './juliaNScopeFlame'
import { rings2Flame } from './rings2'
import { radialBlurFlame } from './radialBlurFlame'
import { ngonFlame } from './ngonFlame'

export const examples = {
  varTest,
  example1,
  empty,
  blobFlame,
  pdjFlame,
  fan2Flame,
  juliaNFlame,
  juliaNScopeFlame,
  perspectiveFlame,
  rings2Flame,
  radialBlurFlame,
  ngonFlame,
} satisfies Record<string, FlameFunction[]>
export type ExampleID = keyof typeof examples
