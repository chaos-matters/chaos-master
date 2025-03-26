import { random } from '@/shaders/random'
import { f32, struct } from 'typegpu/data'
import { parametricVariation } from '../types'

export const GridParams = struct({
  divisions: f32,
  size: f32,
  jitterNearIntersectionsDistance: f32,
})
export const grid = parametricVariation(
  GridParams,
  /* wgsl */ `(_pos: vec2f, P: GridParams) -> vec2f {
    let D = P.jitterNearIntersectionsDistance;
    let divs = select(P.divisions, 1, random() > 0.8);
    let pos = P.size * (2 * vec2f(random(), random()) - 1);
    let jitter = 2 * D * (2 * vec2f(random(), random()) - 1);
    let rounded = round(divs * pos) / divs;
    let diff = abs(pos - rounded);
    let jittered = select(pos, pos + jitter, diff < vec2f(D));
    return select(
      vec2f(rounded.x, jittered.y),
      vec2f(jittered.x, rounded.y),
      random() > 0.5
    );
  }`,
  { random },
)
