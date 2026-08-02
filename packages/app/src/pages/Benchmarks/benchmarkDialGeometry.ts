const TAU = Math.PI * 2

export type BenchmarkDialTone = 'ember' | 'cyan'

export type BenchmarkDialOrbit = {
  rx: number
  ry: number
  rotation: number
  tone: BenchmarkDialTone
  opacity: number
}

function pointOnCircle(radius: number, angleDegrees: number) {
  const angle = (angleDegrees * Math.PI) / 180
  return {
    x: BENCHMARK_DIAL.center + radius * Math.cos(angle),
    y: BENCHMARK_DIAL.center + radius * Math.sin(angle),
  }
}

function arcPath(radius: number, startDegrees: number, endDegrees: number) {
  const start = pointOnCircle(radius, startDegrees)
  const end = pointOnCircle(radius, endDegrees)
  const largeArc = endDegrees - startDegrees > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

export const BENCHMARK_DIAL = {
  size: 220,
  center: 110,
  outerRadius: 103,
  innerRadius: 66,
  coreMaskRadius: 63,
  emberRadius: 89,
  emberStartDegrees: -104,
  emberEndDegrees: 202,
  orbits: [
    { rx: 94, ry: 70, rotation: 38, tone: 'ember', opacity: 0.66 },
    { rx: 88, ry: 74, rotation: 38, tone: 'ember', opacity: 0.2 },
    { rx: 94, ry: 70, rotation: -38, tone: 'cyan', opacity: 0.48 },
    { rx: 88, ry: 74, rotation: -38, tone: 'cyan', opacity: 0.16 },
  ] satisfies BenchmarkDialOrbit[],
} as const

export const BENCHMARK_DIAL_EMBER_ARC = arcPath(
  BENCHMARK_DIAL.emberRadius,
  BENCHMARK_DIAL.emberStartDegrees,
  BENCHMARK_DIAL.emberEndDegrees,
)

export const BENCHMARK_DIAL_EMBER_NODES = [
  { ...pointOnCircle(91, 207), radius: 2.2, opacity: 0.9 },
  { ...pointOnCircle(95, 211), radius: 1.5, opacity: 0.64 },
  { ...pointOnCircle(99, 216), radius: 1, opacity: 0.4 },
] as const

export function drawBenchmarkDialGeometry(
  context: CanvasRenderingContext2D,
  options: { centerX: number; centerY: number; scale: number },
): void {
  const { centerX, centerY, scale } = options
  context.save()
  context.translate(centerX, centerY)
  context.scale(scale, scale)
  context.lineCap = 'round'

  context.strokeStyle = 'rgba(255,255,255,.1)'
  context.lineWidth = 1
  context.beginPath()
  context.arc(0, 0, BENCHMARK_DIAL.outerRadius, 0, TAU)
  context.stroke()

  for (const orbit of BENCHMARK_DIAL.orbits) {
    const [red, green, blue] =
      orbit.tone === 'ember' ? [255, 116, 72] : [115, 217, 255]
    context.strokeStyle = `rgba(${red},${green},${blue},${orbit.opacity})`
    context.lineWidth = orbit.opacity > 0.3 ? 1.35 : 0.8
    context.shadowColor = `rgba(${red},${green},${blue},.18)`
    context.shadowBlur = orbit.opacity > 0.3 ? 4 : 0
    context.beginPath()
    context.ellipse(
      0,
      0,
      orbit.rx,
      orbit.ry,
      (orbit.rotation * Math.PI) / 180,
      0,
      TAU,
    )
    context.stroke()
  }

  context.shadowBlur = 0
  context.strokeStyle = 'rgba(255,116,72,.82)'
  context.lineWidth = 1.3
  context.setLineDash([1.7, 5.2])
  context.beginPath()
  context.arc(
    0,
    0,
    BENCHMARK_DIAL.emberRadius,
    (BENCHMARK_DIAL.emberStartDegrees * Math.PI) / 180,
    (BENCHMARK_DIAL.emberEndDegrees * Math.PI) / 180,
  )
  context.stroke()
  context.setLineDash([])

  context.fillStyle = '#ff7448'
  for (const node of BENCHMARK_DIAL_EMBER_NODES) {
    context.globalAlpha = node.opacity
    context.beginPath()
    context.arc(
      node.x - BENCHMARK_DIAL.center,
      node.y - BENCHMARK_DIAL.center,
      node.radius,
      0,
      TAU,
    )
    context.fill()
  }

  context.globalAlpha = 1
  context.fillStyle = 'rgba(8,10,14,.96)'
  context.beginPath()
  context.arc(0, 0, BENCHMARK_DIAL.coreMaskRadius, 0, TAU)
  context.fill()

  context.strokeStyle = 'rgba(255,116,72,.24)'
  context.lineWidth = 1
  context.beginPath()
  context.arc(0, 0, BENCHMARK_DIAL.innerRadius, 0, TAU)
  context.stroke()

  context.restore()
}
