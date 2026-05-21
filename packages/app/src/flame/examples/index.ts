import { example1 } from './example1'
import { example2 } from './example2'
import { example3 } from './example3'
import { example4 } from './example4'
import { example5 } from './example5'
import { example6 } from './example6'
import { example7 } from './example7'
import { example8 } from './example8'
import { example9 } from './example9'
import { example10 } from './example10'
import { example11 } from './example11'
import { example12 } from './example12'
import { example13 } from './example13'
import { example14 } from './example14'
import { example15 } from './example15'
import { example16 } from './example16'
import { example17 } from './example17'
import { example18 } from './example18'
import { example19 } from './example19'
import { example20 } from './example20'
import { example21 } from './example21'
import { example22 } from './example22'
import { example23 } from './example23'
import { example24 } from './example24'
import { example25 } from './example25'
import { initExample } from './initExample'
import { invCircleEx1, invCircleEx2 } from './invCircle'
import { invCircle2Ex1 } from './invCircle2'
import { linear1 } from './linear1'
import type { FlameDescriptor } from '../schema/flameSchema'

export const examples = {
  initExample,
  example1,
  example2,
  example3,
  example4,
  example5,
  example6,
  example7,
  example8,
  example9,
  example10,
  example11,
  example12,
  example13,
  example14,
  example15,
  example16,
  example17,
  example18,
  example19,
  example20,
  example21,
  example22,
  example23,
  example24,
  example25,
  linear1,
  invCircleEx1,
  invCircleEx2,
  invCircle2Ex1,
} satisfies Record<string, FlameDescriptor>
export type ExampleID = keyof typeof examples
