import { FlameFunction } from '../flameFunction'
import { empty } from './empty'
import { example1 } from './example1'
import { varTest } from '@/flame/examples/varTest'
import { blobFlame } from '@/flame/examples/blobFlame'
import { pdjFlame } from './pdjFlame'
import { fan2Flame } from './fan2'

export const examples = {
  varTest,
  example1,
  empty,
  blobFlame,
  pdjFlame,
  fan2Flame,
} satisfies Record<string, FlameFunction[]>
export type ExampleID = keyof typeof examples
