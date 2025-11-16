import { empty } from './empty'
import { example1 } from './example1'
import { example2 } from './example2'
import { example3 } from './example3'
import { example4 } from './example4'
import { example5 } from './example5'
import { example6 } from './example6'
import { example7 } from './example7'
import { invCircleEx } from './invCircle'
import { linear1 } from './linear1'
import type { FlameDescriptor } from '../schema/flameSchema'
import { invCircleFrac } from './invCircleFrac'

export const examples = {
  empty,
  example1,
  example2,
  example3,
  example4,
  example5,
  example6,
  example7,
  linear1,
  invCircleEx,
  invCircleFrac,
} satisfies Record<string, FlameDescriptor>
export type ExampleID = keyof typeof examples
