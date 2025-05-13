import { empty } from './empty'
import { example1 } from './example1'
import { example2 } from './example2'
import { example3 } from './example3'
import { example4 } from './example4'
import { example5 } from './example5'
import { linear1 } from './linear1'
import type { FlameFunction } from '../flameFunction'

export const examples = {
  empty,
  example1,
  example2,
  example3,
  example4,
  example5,
  linear1,
} satisfies Record<string, FlameFunction[]>
export type ExampleID = keyof typeof examples
