import { empty } from './empty'
import { example1 } from './example1'
import type { FlameFunction } from '../flameFunction'
import { linear1 } from './linear1'

export const examples = {
  example1,
  linear1,
  empty,
} satisfies Record<string, FlameFunction[]>
export type ExampleID = keyof typeof examples
