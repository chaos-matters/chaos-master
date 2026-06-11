import { vec2f } from 'typegpu/data'
import { abs, round, select } from 'typegpu/std'
import { random } from '@/shaders/random'
import { EPS } from '../../../constants'
import { simpleVariation } from '../types'

export const boardersVar = simpleVariation('boardersVar', (pos, varInfo) => {
  'use gpu'
  const roundX = round(pos.x)
  const roundY = round(pos.y)
  const offsetX = pos.x - roundX
  const offsetY = pos.y - roundY

  const isRandom = random() >= 0.75
  const isXdom = abs(offsetX) >= abs(offsetY)
  const isXpos = offsetX >= 0.0
  const isYpos = offsetY >= 0.0

  const rx = offsetX * 0.5 + roundX
  const ry = offsetY * 0.5 + roundY

  const xxp_x = offsetX * 0.5 + roundX + 0.25
  const xxp_y = offsetY * 0.5 + roundY + (0.25 * offsetY) / (offsetX + EPS.$)

  const xxn_x = offsetX * 0.5 + roundX - 0.25
  const xxn_y = offsetY * 0.5 + roundY - (0.25 * offsetY) / (offsetX + EPS.$)

  const yyp_x = offsetX * 0.5 + roundX + (offsetX / (offsetY + EPS.$)) * 0.25
  const yyp_y = offsetY * 0.5 + roundY + 0.25

  const yyn_x = offsetX * 0.5 + roundX - (offsetX / (offsetY + EPS.$)) * 0.25
  const yyn_y = offsetY * 0.5 + roundY - 0.25

  const xdom_x = select(xxn_x, xxp_x, isXpos)
  const xdom_y = select(xxn_y, xxp_y, isXpos)

  const ydom_x = select(yyn_x, yyp_x, isYpos)
  const ydom_y = select(yyn_y, yyp_y, isYpos)

  const nonrand_x = select(ydom_x, xdom_x, isXdom)
  const nonrand_y = select(ydom_y, xdom_y, isXdom)

  return vec2f(
    select(nonrand_x, rx, isRandom),
    select(nonrand_y, ry, isRandom),
  ).mul(varInfo.weight)
})
