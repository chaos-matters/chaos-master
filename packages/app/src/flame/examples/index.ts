import { blobFlame } from './blobFlame'
import { empty } from './empty'
import { example1 } from './example1'
import { fan2Flame } from './fan2'
import { juliaNFlame } from './juliaNFlame'
import { juliaNScopeFlame } from './juliaNScopeFlame'
import { ngonFlame } from './ngonFlame'
import { pdjFlame } from './pdjFlame'
import { perspectiveFlame } from './perspectiveFlame'
import { radialBlurFlame } from './radialBlurFlame'
import { rings2Flame } from './rings2'
import { varTest } from './varTest'
import type { FlameFunction } from '../flameFunction'

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
