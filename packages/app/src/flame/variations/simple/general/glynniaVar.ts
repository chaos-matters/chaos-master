import { vec2f } from 'typegpu/data'
import { select, sqrt } from 'typegpu/std'
import { random } from '@/shaders/random'
import { EPS } from '../../../constants'
import { simpleVariation } from '../types'

export const glynniaVar = simpleVariation(
  'glynniaVar',
  (pos, varInfo) => {
    'use gpu'
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const big = r >= 1.0
    const side1 = random() > 0.5

    // Branch 1/3: sqrt branch (vvar2 * d, with vvar2 = weight / sqrt(2))
    const md = sqrt(r + pos.x)
    const safeMd = select(md, EPS.$, md === 0.0)
    const b1x = safeMd / 1.4142135623730951 // d / sqrt(2)
    const b1y = -pos.y / (safeMd * 1.4142135623730951) // -y / (d * sqrt(2))

    // Branch 2/4: r + x branch (pAmount / dx)
    const d = r + pos.x
    const dx = sqrt(r * (pos.y * pos.y + d * d))
    const safeDx = select(dx, EPS.$, dx === 0.0)
    const b2x = d / safeDx
    const b2y = pos.y / safeDx

    // y is the same for big and small cases
    const newY = select(b2y, b1y, side1)
    // x: positive for r>=1, negative for r<1
    const xBranch = select(b2x, b1x, side1)
    const newX = select(-xBranch, xBranch, big)

    return vec2f(newX, newY).mul(varInfo.weight)
  },
  'general',
)
