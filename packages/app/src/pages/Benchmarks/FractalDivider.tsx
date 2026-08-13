import type { JSX } from 'solid-js'

const WIDTH = 1200
const HEIGHT = 64
const MIN_R = 3.72
const MAX_R = 4

function settleOrbit(r: number, seed: number, steps = 96): number {
  let value = seed
  for (let step = 0; step < steps; step += 1) {
    value = r * value * (1 - value)
  }
  return value
}

function mapOrbitPoint(
  column: number,
  columnCount: number,
  sample: number,
  value: number,
) {
  const progress = column / (columnCount - 1)
  const envelope = 0.68 + progress * progress * (3 - 2 * progress) * 0.32
  const jitter =
    (((column * 17 + sample * 37) % 29) / 28 - 0.5) * (0.7 + progress * 0.9)
  const verticalJitter = (((column * 43 + sample * 19) % 31) / 30 - 0.5) * 5.2
  const x = 42 + progress * (WIDTH - 84) + jitter
  const y =
    HEIGHT / 2 + (0.5 - value) * (HEIGHT - 10) * envelope + verticalJitter
  return [x, y] as const
}

function createOrbitDust(): string {
  const columnCount = 316
  const samplesPerColumn = 18
  const points: string[] = []

  for (let column = 0; column < columnCount; column += 1) {
    const r = MIN_R + (column / (columnCount - 1)) * (MAX_R - MIN_R)
    let value = settleOrbit(r, 0.417 + column * 0.000_013, 112)
    const seenValues = new Set<number>()
    const orbitValues: { sample: number; value: number }[] = []

    for (let sample = 0; sample < samplesPerColumn; sample += 1) {
      value = r * value * (1 - value)
      const valueKey = Math.round(value * 100_000)
      if (seenValues.has(valueKey)) continue
      seenValues.add(valueKey)
      orbitValues.push({ sample, value })
    }

    for (const orbit of orbitValues) {
      const [x, y] = mapOrbitPoint(
        column,
        columnCount,
        orbit.sample,
        orbit.value,
      )
      points.push(`M${x.toFixed(2)} ${y.toFixed(2)}h0.01`)
    }
  }

  return points.join('')
}

const ORBIT_DUST_PATH = createOrbitDust()

function shouldMirror(id: string): boolean {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % 2 === 1
}

export function FractalDivider(props: {
  id: string
  class?: string
  label?: string
}): JSX.Element {
  const gradientId = `fractal-divider-gradient-${props.id}`
  const maskId = `fractal-divider-mask-${props.id}`
  const maskGradientId = `fractal-divider-mask-gradient-${props.id}`
  const transform = shouldMirror(props.id)
    ? `translate(${WIDTH} 0) scale(-1 1)`
    : undefined

  return (
    <svg
      class={props.class}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role={props.label ? 'img' : 'presentation'}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : 'true'}
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="34"
          x2={WIDTH - 34}
        >
          <stop offset="0" stop-color="#ff7448" stop-opacity="0" />
          <stop offset="0.16" stop-color="#ff7448" stop-opacity="0.9" />
          <stop offset="0.53" stop-color="#f3a64b" stop-opacity="0.7" />
          <stop offset="0.79" stop-color="#73d9ff" stop-opacity="0.56" />
          <stop offset="1" stop-color="#73d9ff" stop-opacity="0" />
        </linearGradient>
        <linearGradient id={maskGradientId} x1="0" x2="1">
          <stop offset="0" stop-color="black" />
          <stop offset="0.06" stop-color="white" />
          <stop offset="0.92" stop-color="white" />
          <stop offset="1" stop-color="black" />
        </linearGradient>
        <mask id={maskId}>
          <rect
            width={WIDTH}
            height={HEIGHT}
            fill={`url(#${maskGradientId})`}
          />
        </mask>
      </defs>
      <g transform={transform} mask={`url(#${maskId})`}>
        <path
          d={ORBIT_DUST_PATH}
          fill="none"
          stroke={`url(#${gradientId})`}
          stroke-width="1.02"
          stroke-linecap="round"
          stroke-opacity="0.78"
          vector-effect="non-scaling-stroke"
        />
      </g>
    </svg>
  )
}
