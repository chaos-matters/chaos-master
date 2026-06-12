import { createMemo, createResource, createSignal, Show, Suspense, } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { DEFAULT_POINT_COUNT } from '@/defaults'
import { examples } from '@/flame/examples'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { getWebgpuComponents } from '@/lib/WebgpuAdapter'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { formatBytes } from '@/utils/formatBytes'
import { GIT_SHA, VERSION } from '@/version'
import { useRequestModal } from '../Modal/ModalContext'
import ui from './BenchmarkModal.module.css'

const BENCHMARK_SECONDS = 10

function getAchievementBadge(bps: number): { label: string; cssClass: string } {
  if (bps >= 5) return { label: '5B+', cssClass: 'badgeUltra' }
  if (bps >= 3) return { label: '3B+', cssClass: 'badgeElite' }
  if (bps >= 1) return { label: '1B+', cssClass: 'badgePro' }
  return { label: 'SPARK', cssClass: 'badgeSpark' }
}

async function getGPUDeviceInformation() {
  const { adapter } = await getWebgpuComponents({
    powerPreference: 'high-performance',
  })
  const { info, limits } = adapter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memoryHeaps: { size: number }[] | undefined = (info as any).memoryHeaps
  const heaps = memoryHeaps?.map((m) => m.size)

  return {
    description: info.description,
    vendor: info.vendor,
    architecture: info.architecture,
    maxBufferSize: limits.maxBufferSize,
    heaps,
  }
}

function gatherBenchmarkLog(
  bps: number,
  totalPoints: number,
  gpuInfo?: Awaited<ReturnType<typeof getGPUDeviceInformation>>,
): string {
  const lines: string[] = []
  const { navigator: n } = globalThis

  lines.push('**Chaos Master Benchmark**')
  lines.push(`Version  : ${VERSION}${GIT_SHA ? ` (${GIT_SHA})` : ''}`)

  if (gpuInfo) {
    if (gpuInfo.description) lines.push(`GPU      : ${gpuInfo.description}`)
    lines.push(`Vendor   : ${gpuInfo.vendor}`)
    if (gpuInfo.architecture) lines.push(`Arch     : ${gpuInfo.architecture}`)
    if (gpuInfo.heaps) {
      lines.push(
        `VRAM     : ${gpuInfo.heaps.map((s) => formatBytes(s)).join(' + ')}`,
      )
    }
  }

  if (n.hardwareConcurrency) {
    lines.push(`CPU      : ${n.hardwareConcurrency} cores`)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deviceMemory = (n as any).deviceMemory as number | undefined
  if (deviceMemory !== undefined) {
    lines.push(`RAM      : ~${deviceMemory} GB`)
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  lines.push(`Platform : ${n.platform}`)
  lines.push(`MPS      : ${(bps * 1000).toFixed(1)}`)
  lines.push(`BPS      : ${bps.toFixed(3)}`)
  lines.push(`Points   : ${totalPoints.toLocaleString()}`)

  return lines.join('\n')
}

type BenchmarkState = 'idle' | 'running' | 'complete'

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: 'green' | 'blue',
) {
  ctx.font = '11px Inter, system-ui, sans-serif'
  const tw = ctx.measureText(text).width
  const pw = tw + 16
  const ph = 22

  if (color === 'green') {
    ctx.fillStyle = 'rgba(72,199,142,0.12)'
    ctx.strokeStyle = 'rgba(72,199,142,0.25)'
  } else {
    ctx.fillStyle = 'rgba(72,156,255,0.12)'
    ctx.strokeStyle = 'rgba(72,156,255,0.25)'
  }
  roundRect(ctx, x, y, pw, ph, 11)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = color === 'green' ? '#7fdfb8' : '#7fb8ff'
  ctx.fillText(text, x + 8, y + 15)
}

function drawAchievementBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  cssClass: string,
) {
  ctx.font = 'bold 10px Inter, system-ui, sans-serif'
  const tw = ctx.measureText(label).width
  const pw = tw + 16
  const ph = 22

  let grad: CanvasGradient
  switch (cssClass) {
    case 'badgeUltra':
      grad = ctx.createLinearGradient(x, y, x + pw, y + ph)
      grad.addColorStop(0, '#c47fff')
      grad.addColorStop(0.35, '#ff7eb6')
      grad.addColorStop(0.65, '#f7c948')
      grad.addColorStop(1, '#7fdfb8')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(196,127,255,0.4)'
      ctx.shadowBlur = 8
      break
    case 'badgeElite':
      grad = ctx.createLinearGradient(x, y, x + pw, y + ph)
      grad.addColorStop(0, '#f7c948')
      grad.addColorStop(1, '#d4a832')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(247,201,72,0.35)'
      ctx.shadowBlur = 6
      break
    case 'badgePro':
      grad = ctx.createLinearGradient(x, y, x + pw, y + ph)
      grad.addColorStop(0, '#7fb8ff')
      grad.addColorStop(1, '#5a8fd4')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(127,184,255,0.3)'
      ctx.shadowBlur = 5
      break
    default: // badgeSpark
      grad = ctx.createLinearGradient(x, y, x + pw, y + ph)
      grad.addColorStop(0, '#e8995e')
      grad.addColorStop(1, '#c47a3a')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(232,153,94,0.25)'
      ctx.shadowBlur = 4
      break
  }
  roundRect(ctx, x, y, pw, ph, 11)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  ctx.fillStyle = '#ffffff'
  ctx.fillText(label, x + 8, y + 15)
}

function BenchmarkModal(props: { respond: () => void }) {
  const [gpuDeviceInfo] = createResource(getGPUDeviceInformation)
  const [state, setState] = createSignal<BenchmarkState>('idle')
  const [totalPoints, setTotalPoints] = createSignal(0)
  const [liveBps, setLiveBps] = createSignal(0)
  const [progress, setProgress] = createSignal(0)
  const [finalBps, setFinalBps] = createSignal(0)
  const [copied, setCopied] = createSignal(false)
  const [imageCopied, setImageCopied] = createSignal(false)
  let startTime = 0
  let running = false

  function handleStart() {
    setTotalPoints(0)
    setLiveBps(0)
    setProgress(0)
    setFinalBps(0)
    startTime = 0
    running = true
    setState('running')
  }

  function handleCancel() {
    running = false
    setState('idle')
    startTime = 0
    setTotalPoints(0)
  }

  function handleAccumulatedPoints(count: number) {
    if (!running) return

    if (count === 0) return

    if (startTime === 0) {
      startTime = globalThis.performance.now()
    }

    const elapsed = (globalThis.performance.now() - startTime) / 1000
    setTotalPoints(count)
    setLiveBps(count / elapsed / 1e9)
    setProgress(Math.min((elapsed / BENCHMARK_SECONDS) * 100, 100))

    if (elapsed >= BENCHMARK_SECONDS) {
      running = false
      setFinalBps(count / elapsed / 1e9)
      setState('complete')
    }
  }

  function copyBenchmarkLog() {
    const text = gatherBenchmarkLog(finalBps(), totalPoints(), gpuDeviceInfo())
    void globalThis.navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function renderBenchmarkCard(): HTMLCanvasElement {
    const W = 600
    const H = 320
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H)
    bgGrad.addColorStop(0, '#0f0f1a')
    bgGrad.addColorStop(1, '#1a1025')
    ctx.fillStyle = bgGrad
    roundRect(ctx, 0, 0, W, H, 16)
    ctx.fill()

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.02)'
    ctx.lineWidth = 0.5
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }

    // Top accent line
    const accentGrad = ctx.createLinearGradient(0, 0, W, 0)
    accentGrad.addColorStop(0, '#ff6b35')
    accentGrad.addColorStop(0.5, '#f7c948')
    accentGrad.addColorStop(1, '#ff6b35')
    ctx.fillStyle = accentGrad
    roundRect(ctx, 20, 16, W - 40, 3, 2)
    ctx.fill()

    // Title
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 22px Inter, system-ui, sans-serif'
    ctx.fillText('Chaos Master Benchmark', 28, 54)

    // Version pill
    const versionText = `v${VERSION}${GIT_SHA ? ` (${GIT_SHA})` : ''}`
    ctx.font = '11px Inter, system-ui, sans-serif'
    const vw = ctx.measureText(versionText).width
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    roundRect(ctx, W - vw - 44, 36, vw + 16, 20, 10)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText(versionText, W - vw - 36, 50)

    const info = gpuDeviceInfo()

    // Device info
    let y = 90
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.fillText('DEVICE', 28, y)
    y += 22

    const devices: { label: string; value: string; color: 'green' | 'blue' }[] =
      []
    if (info?.description)
      devices.push({ label: 'GPU', value: info.description, color: 'green' })
    if (info?.vendor)
      devices.push({ label: 'Vendor', value: info.vendor, color: 'blue' })
    if (info?.architecture)
      devices.push({ label: 'Arch', value: info.architecture, color: 'blue' })
    if (info?.heaps) {
      devices.push({
        label: 'VRAM',
        value: info.heaps.map((s) => formatBytes(s)).join(' + '),
        color: 'green',
      })
    }
    for (const d of devices) {
      drawPill(ctx, 28, y, d.value, d.color)
      y += 28
    }

    // CPU/RAM
    const sysParts: string[] = []
    if (globalThis.navigator.hardwareConcurrency) {
      sysParts.push(`${globalThis.navigator.hardwareConcurrency} CPU cores`)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deviceMemory = (globalThis.navigator as any).deviceMemory as
      | number
      | undefined
    if (deviceMemory !== undefined) {
      sysParts.push(`~${deviceMemory} GB RAM`)
    }
    if (sysParts.length > 0) {
      drawPill(ctx, 28, y, sysParts.join('  ·  '), 'green')
      y += 28
    }

    // Results (right column)
    const rx = 360
    let ry = 82

    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.fillText('MILLIONS / SECOND', rx, ry)
    ry += 44

    const mps = finalMps()
    const mpsGrad = ctx.createLinearGradient(rx, ry - 32, rx + 100, ry + 8)
    mpsGrad.addColorStop(0, '#ff8a5e')
    mpsGrad.addColorStop(0.5, '#ff6b35')
    mpsGrad.addColorStop(1, '#e84428')
    ctx.fillStyle = mpsGrad
    ctx.font = 'bold 34px Inter, system-ui, sans-serif'
    ctx.fillText(mps.toFixed(1), rx, ry)
    ry += 36

    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '12px Inter, system-ui, sans-serif'
    ctx.fillText(`${finalBps().toFixed(3)} B/s`, rx, ry)
    ry += 22

    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font = '10px Inter, system-ui, sans-serif'
    const tp = totalPoints()
    const ptsCompact =
      tp >= 1e9
        ? `${(tp / 1e9).toFixed(2)}B`
        : tp >= 1e6
          ? `${(tp / 1e6).toFixed(1)}M`
          : `${(tp / 1e3).toFixed(0)}K`
    ctx.fillText(`${ptsCompact} pts`, rx, ry)
    ry += 22

    // Achievement badge
    const badge = achievementBadge()
    drawAchievementBadge(ctx, rx, ry, badge.label, badge.cssClass)
    ry += 36

    // Footer
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const platform = globalThis.navigator.platform || 'Unknown'
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.fillText(
      `${platform}  ·  ${new Date().toISOString().split('T')[0]}`,
      28,
      H - 24,
    )

    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillText('chaos-master.com', W - 110, H - 24)

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 16)
    ctx.stroke()

    return canvas
  }

  function copyBenchmarkImage() {
    const canvas = renderBenchmarkCard()
    canvas.toBlob((blob) => {
      if (!blob) return
      void globalThis.navigator.clipboard
        .write([new ClipboardItem({ 'image/png': blob })])
        .then(() => {
          setImageCopied(true)
          setTimeout(() => setImageCopied(false), 1500)
        })
    }, 'image/png')
  }

  const finalMps = createMemo(() => finalBps() * 1000)
  const achievementBadge = createMemo(() => getAchievementBadge(finalBps()))

  const cameraZoom = createSignal(1)
  const cameraPosition = createSignal(vec2f(0, 0))

  return (
    <>
      <div class={ui.heroSection}>
        <h1 class={ui.heroTitle}>Benchmark</h1>
        <button
          class={ui.closeBtn}
          onClick={() => {
            props.respond()
          }}
          title="Close"
        >
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path
              fill="currentColor"
              d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"
            />
          </svg>
        </button>
      </div>

      <Show when={state() === 'idle'}>
        <div class={ui.stateSection}>
          <p class={ui.descText}>
            Run a standardized IFS fractal render for {BENCHMARK_SECONDS}{' '}
            seconds to measure your GPU's performance in Billions of Points Per
            Second (BPS). The result can be shared on Discord for leaderboard
            challenges.
          </p>
          <button class={ui.runBtn} onClick={handleStart}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              width="16"
              height="16"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Run Benchmark
          </button>
        </div>
      </Show>

      <Show when={state() === 'running'}>
        <div class={ui.runningSection}>
          <div class={ui.progressWrap}>
            <div class={ui.progressBar}>
              <div
                class={ui.progressFill}
                style={{ width: `${progress()}%` }}
              />
            </div>
            <div class={ui.progressStats}>
              <span class={ui.liveBps}>
                {(liveBps() * 1000).toFixed(1)} M/s
              </span>
              <span class={ui.progressPct}>{progress().toFixed(0)}%</span>
            </div>
          </div>
          <button class={ui.cancelBtn} onClick={handleCancel}>
            Cancel
          </button>
        </div>
        <div class={ui.previewCanvas}>
          <Root adapterOptions={{ powerPreference: 'high-performance' }}>
            <AutoCanvas
              fixedResolution={{ width: 256, height: 256 }}
              alphaMode="opaque"
            >
              <WheelZoomCamera2D
                zoom={cameraZoom}
                position={cameraPosition}
                interactive={() => false}
              >
                <Flam3
                  quality={0.999}
                  pointCountPerBatch={DEFAULT_POINT_COUNT}
                  adaptiveFilterEnabled={false}
                  animationEnabled={false}
                  flameDescriptor={examples.benchmark}
                  renderInterval={0}
                  disableQualityLimit={true}
                  edgeFadeColor={vec4f(0)}
                  palette={() => undefined}
                  outputAlpha={false}
                  onAccumulatedPointCount={handleAccumulatedPoints}
                />
              </WheelZoomCamera2D>
            </AutoCanvas>
          </Root>
        </div>
      </Show>

      <Show when={state() === 'complete'}>
        <div class={ui.completeSection}>
          <div class={ui.resultCard}>
            <div class={ui.resultGrid}>
              <div class={ui.resultRow}>
                <div class={ui.resultNumber}>{finalMps().toFixed(1)}</div>
                <div class={ui.resultLabel}>Millions of Points / Second</div>
              </div>
              <div class={ui.resultRow}>
                <div class={ui.resultNumber}>
                  {finalBps().toFixed(3)}
                  <span class={ui.resultUnit}> B/s</span>
                </div>
                <Show when={achievementBadge()} keyed>
                  {(badge) => (
                    <span
                      class={ui.achievementBadge}
                      classList={{ [ui[badge.cssClass]!]: true }}
                    >
                      {badge.label}
                    </span>
                  )}
                </Show>
              </div>
              <div class={ui.resultRow}>
                <div class={ui.resultNumber}>
                  {totalPoints().toLocaleString()}
                  <span class={ui.resultUnit}> pts</span>
                </div>
                <div class={ui.resultLabel}>
                  Total Points in {BENCHMARK_SECONDS}s
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>

      <div class={ui.deviceHeader}>
        <h2 class={ui.sectionTitle}>Device Info</h2>
      </div>
      <div class={ui.deviceSection}>
        <Suspense
          fallback={<span class={ui.deviceLoading}>Querying GPU...</span>}
        >
          <Show when={gpuDeviceInfo()} keyed>
            {(deviceInfo) => {
              const rows: {
                label: string
                value: string
                color: 'green' | 'blue'
              }[] = []
              if (deviceInfo.description !== '') {
                rows.push({
                  label: 'Device',
                  value: deviceInfo.description,
                  color: 'green',
                })
              }
              rows.push({
                label: 'Vendor',
                value: deviceInfo.vendor,
                color: 'blue',
              })
              if (deviceInfo.architecture !== '') {
                rows.push({
                  label: 'Architecture',
                  value: deviceInfo.architecture,
                  color: 'blue',
                })
              }
              if (deviceInfo.heaps) {
                rows.push({
                  label: 'VRAM',
                  value: deviceInfo.heaps
                    .map((size) => formatBytes(size))
                    .join(' + '),
                  color: 'green',
                })
              }
              return (
                <div class={ui.deviceGrid}>
                  {rows.map((row) => (
                    <>
                      <span class={ui.deviceLabel}>{row.label}</span>
                      <span class={ui.deviceValue}>
                        <span
                          class={ui.devicePill}
                          classList={{
                            [ui.devicePillBlue!]: row.color === 'blue',
                          }}
                        >
                          {row.value}
                        </span>
                      </span>
                    </>
                  ))}
                </div>
              )
            }}
          </Show>
        </Suspense>
      </div>

      <Show when={state() === 'complete'}>
        <div class={ui.footer}>
          <button
            class={ui.copyBtn}
            classList={{ [ui.copyBtnCopied!]: copied() }}
            onClick={copyBenchmarkLog}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
              {copied() ? (
                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
              ) : (
                <path d="M4 2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h1v-1H4V3h7v2h1V3a1 1 0 0 0-1-1H4zm3 4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H7zm0 1h7v7H7V7z" />
              )}
            </svg>
            {copied() ? 'Copied!' : 'Copy Benchmark Log'}
          </button>
          <button
            class={ui.copyBtn}
            classList={{ [ui.copyBtnCopied!]: imageCopied() }}
            onClick={copyBenchmarkImage}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
              {imageCopied() ? (
                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
              ) : (
                <>
                  <path d="M1 2.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-11zm1 8.8 2.8-2.8a.5.5 0 0 1 .7 0l2 2 2.8-2.3a.5.5 0 0 1 .6 0L14 11V3H2v8.3z" />
                  <circle cx="4.5" cy="5.5" r="1.2" />
                </>
              )}
            </svg>
            {imageCopied() ? 'Copied!' : 'Copy as Image'}
          </button>
        </div>
        <div class={ui.caveatSection}>
          Share your result in the #benchmarks channel on Discord. Scores
          measured across different GPUs and browsers are not directly
          comparable — this is for fun!
        </div>
      </Show>
    </>
  )
}

export function createShowBenchmark() {
  const requestModal = useRequestModal()

  async function showBenchmark() {
    await requestModal({
      class: ui.benchmarkModal,
      content: ({ respond }) => <BenchmarkModal respond={respond} />,
    })
  }

  return showBenchmark
}
