import { For, Show } from 'solid-js'
import { vec3f } from 'typegpu/data'
import ui from '@/App.module.css'
import { Button } from '@/components/Button/Button'
import { Checkbox } from '@/components/Checkbox/Checkbox'
import { CollapsibleCard } from '@/components/CollapsibleCard/CollapsibleCard'
import { ColorPicker } from '@/components/ColorPicker/ColorPicker'
import { Card } from '@/components/ControlCard/ControlCard'
import { Slider } from '@/components/Sliders/Slider'
import { KeyframeDiamond } from '@/components/Timeline/KeyframeDiamond'
import { colorInitModeToImplFn } from '@/flame/colorInitMode'
import { drawModeToImplFn } from '@/flame/drawMode'
import { pointInitModeToImplFn } from '@/flame/pointInitMode'
import { pointInitMode3DToImplFn } from '@/flame/pointInitMode3D'
import { MAX_SKIP_ITERS_VALUE } from '@/flame/schema/flameSchema'
import { startViewTransition } from '@/lib/viewTransition'
import { recordKeys } from '@/utils/record'
import type { Accessor, Setter } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface RenderSettingsSectionProps {
  flameDescriptor: FlameDescriptor
  renderCardOpen: Accessor<boolean>
  setRenderCardOpen: Setter<boolean>
  metadataCardOpen: Accessor<boolean>
  setMetadataCardOpen: Setter<boolean>
  setTargetedParameter: (param: string) => void
  setRenderSetting: (key: string, value: unknown) => void
  setRenderSettings: (
    settings: Partial<FlameDescriptor['renderSettings']>,
  ) => void
  stochasticFilterEnabled: Accessor<boolean>
  selectedPaletteId: Accessor<string>
  cmdContext: CommandContext
  executeCommand: (
    name: string,
    ctx: CommandContext,
    ...args: unknown[]
  ) => unknown
}

export function RenderSettingsSection(props: RenderSettingsSectionProps) {
  const {
    flameDescriptor,
    renderCardOpen,
    setRenderCardOpen,
    metadataCardOpen,
    setMetadataCardOpen,
    setTargetedParameter,
    setRenderSetting,
    setRenderSettings,
    stochasticFilterEnabled,
    selectedPaletteId,
    cmdContext,
    executeCommand,
  } = props

  return (
    <>
      <CollapsibleCard
        title="Render"
        open={renderCardOpen()}
        onToggleOpen={() => {
          setRenderCardOpen((open) => !open)
        }}
      >
        <Card>
          {/* -- Tone Mapping -- */}
          <div class={ui.settingsGroup}>
            <span class={ui.settingsGroupLabel}>Tone Mapping</span>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('skipIters')
              }}
            >
              <Slider
                label="Skip Iterations"
                value={flameDescriptor.renderSettings.skipIters}
                min={0}
                max={MAX_SKIP_ITERS_VALUE}
                step={1}
                onInput={(newSkipIters) => {
                  setRenderSetting('skipIters', newSkipIters)
                }}
                formatValue={(value) => value.toString()}
                dataParameterPath="skipIters"
                data-tour-target="skipIters-slider"
              />
            </div>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('plotsPerChain')
              }}
            >
              <Slider
                label="Point Batch"
                data-tour-target="pointBatch-slider"
                value={flameDescriptor.renderSettings.plotsPerChain}
                min={1}
                max={32}
                step={1}
                onInput={(plotsPerChain) => {
                  setRenderSetting('plotsPerChain', plotsPerChain)
                }}
                formatValue={(value) => value.toString()}
                dataParameterPath="plotsPerChain"
              />
            </div>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('exposure')
              }}
            >
              <Slider
                label="Exposure"
                value={flameDescriptor.renderSettings.exposure}
                min={-8}
                max={8}
                step={0.001}
                onInput={(newExp) => {
                  const rs = flameDescriptor.renderSettings
                  const rebasing =
                    rs.autoExposure3D && (rs.dimensions ?? 2) === 3
                  setRenderSettings(
                    rebasing
                      ? {
                          exposure: newExp,
                          autoExposure3DBase: newExp,
                          autoExposure3DRefRadius: rs.camera3D?.radius ?? 5,
                        }
                      : { exposure: newExp },
                  )
                }}
                formatValue={(value) => value.toFixed(2)}
                dataParameterPath="exposure"
                data-tour-target="exposure-slider"
              />
            </div>
            <Show when={flameDescriptor.renderSettings.dimensions === 3}>
              <label
                data-parameter-path="autoExposure3D"
                style={{
                  'grid-column': '1 / -1',
                  display: 'flex',
                  'align-items': 'center',
                  gap: '6px',
                  'font-size': '12px',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
              >
                <Checkbox
                  checked={flameDescriptor.renderSettings.autoExposure3D}
                  onChange={(checked) => {
                    const rs = flameDescriptor.renderSettings
                    setRenderSettings(
                      checked
                        ? {
                            autoExposure3D: true,
                            autoExposure3DRefRadius: rs.camera3D?.radius ?? 5,
                            autoExposure3DBase: rs.exposure,
                          }
                        : { autoExposure3D: false },
                    )
                  }}
                />
                <span>Auto exposure on zoom</span>
              </label>
              <Show when={flameDescriptor.renderSettings.autoExposure3D}>
                <div class={ui.parameterTarget}>
                  <Slider
                    label="Auto Strength"
                    value={
                      flameDescriptor.renderSettings.autoExposure3DStrength
                    }
                    min={0}
                    max={3}
                    step={0.05}
                    onInput={(strength) => {
                      setRenderSetting('autoExposure3DStrength', strength)
                    }}
                    formatValue={(value) => value.toFixed(2)}
                  />
                </div>
              </Show>
            </Show>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('gamma')
              }}
            >
              <Slider
                label="Gamma"
                value={flameDescriptor.renderSettings.gamma}
                min={0.1}
                max={8}
                step={0.01}
                onInput={(newVal) => {
                  setRenderSetting('gamma', newVal)
                }}
                formatValue={(value) => value.toFixed(2)}
                dataParameterPath="gamma"
                data-tour-target="gamma-slider"
              />
            </div>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('contrast')
              }}
            >
              <Slider
                label="Contrast"
                value={flameDescriptor.renderSettings.contrast}
                min={0.01}
                max={20}
                step={0.01}
                onInput={(newVal) => {
                  setRenderSetting('contrast', newVal)
                }}
                formatValue={(value) => value.toFixed(2)}
                dataParameterPath="contrast"
                data-tour-target="contrast-slider"
              />
            </div>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('vibrancy')
              }}
            >
              <Slider
                label="Vibrancy"
                value={flameDescriptor.renderSettings.vibrancy}
                min={0}
                max={3}
                step={0.05}
                onInput={(newVibrancy) => {
                  setRenderSetting('vibrancy', newVibrancy)
                }}
                formatValue={(value) => value.toFixed(2)}
                dataParameterPath="vibrancy"
                data-tour-target="vibrancy-slider"
              />
            </div>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('highlightPower')
              }}
            >
              <Slider
                label="Highlight Power"
                value={flameDescriptor.renderSettings.highlightPower}
                min={0}
                max={2}
                step={0.01}
                onInput={(newVal) => {
                  setRenderSetting('highlightPower', newVal)
                }}
                formatValue={(value) => value.toFixed(2)}
                dataParameterPath="highlightPower"
                data-tour-target="highlightPower-slider"
              />
            </div>
            <Show when={(flameDescriptor.renderSettings.dimensions ?? 2) === 3}>
              <div
                class={ui.parameterTarget}
                onClick={() => {
                  setTargetedParameter('depthColorPower')
                }}
              >
                <Slider
                  label="Depth Coloring"
                  value={flameDescriptor.renderSettings.depthColorPower ?? 0.0}
                  min={0}
                  max={5}
                  step={0.05}
                  onInput={(newVal) => {
                    setRenderSetting('depthColorPower', newVal)
                  }}
                  formatValue={(value) => value.toFixed(2)}
                  dataParameterPath="depthColorPower"
                  data-tour-target="depthColorPower-slider"
                />
              </div>
              <div
                class={ui.parameterTarget}
                onClick={() => {
                  setTargetedParameter('lightPower')
                }}
              >
                <Slider
                  label="Light Power"
                  value={flameDescriptor.renderSettings.lightPower ?? 0.0}
                  min={0}
                  max={1.5}
                  step={0.01}
                  onInput={(newVal) => {
                    setRenderSetting('lightPower', newVal)
                  }}
                  formatValue={(value) => value.toFixed(2)}
                  dataParameterPath="lightPower"
                  data-tour-target="lightPower-slider"
                />
              </div>
            </Show>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('densityEstimationQuality')
              }}
            >
              <Slider
                label="Filter Quality"
                value={
                  flameDescriptor.renderSettings.densityEstimationQuality ?? 0.8
                }
                min={0}
                max={1}
                step={0.01}
                onInput={(newVal) => {
                  setRenderSetting('densityEstimationQuality', newVal)
                }}
                formatValue={(value) => value.toFixed(2)}
                dataParameterPath="densityEstimationQuality"
                data-tour-target="filterQuality-slider"
              />
            </div>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('estimatorCurve')
              }}
            >
              <Slider
                label="Estimator Curve"
                value={flameDescriptor.renderSettings.estimatorCurve ?? 0.5}
                min={0.1}
                max={1}
                step={0.05}
                onInput={(newVal) => {
                  setRenderSetting('estimatorCurve', newVal)
                }}
                formatValue={(value) => value.toFixed(2)}
                dataParameterPath="estimatorCurve"
                data-tour-target="estimatorCurve-slider"
                disabled={stochasticFilterEnabled()}
                disabledReason="The estimator curve only affects the density-estimation pass, which is bypassed while the Mitchell-Netravali (MN) filter is active. Turn off MN to use it."
              />
            </div>
          </div>

          {/* -- Modes -- */}
          <div class={ui.settingsGroup}>
            <span class={ui.settingsGroupLabel}>Modes</span>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('drawMode')
              }}
            >
              <label class={ui.labeledInput} data-tour-target="drawMode-select">
                <span>
                  <KeyframeDiamond parameterPath="drawMode" />
                  Draw Mode
                </span>
                <select
                  class={ui.select}
                  value={flameDescriptor.renderSettings.drawMode}
                  onChange={(ev) => {
                    const mode = ev.currentTarget.value
                    const update = () => {
                      setRenderSetting('drawMode', mode)
                    }
                    startViewTransition(update)
                  }}
                >
                  <For each={recordKeys(drawModeToImplFn)}>
                    {(drawMode) => <option value={drawMode}>{drawMode}</option>}
                  </For>
                </select>
                <span></span>
              </label>
            </div>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('colorInitMode')
              }}
            >
              <label
                class={ui.labeledInput}
                data-tour-target="colorInitMode-select"
              >
                <span>
                  <KeyframeDiamond parameterPath="colorInitMode" />
                  Color Init Mode
                </span>
                <select
                  class={ui.select}
                  value={flameDescriptor.renderSettings.colorInitMode}
                  onChange={(ev) => {
                    const mode = ev.currentTarget.value
                    const update = () => {
                      setRenderSetting('colorInitMode', mode)
                    }
                    startViewTransition(update)
                  }}
                >
                  <For each={recordKeys(colorInitModeToImplFn)}>
                    {(colorInitMode) => (
                      <option value={colorInitMode}>{colorInitMode}</option>
                    )}
                  </For>
                </select>
                <span></span>
              </label>
            </div>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('pointInitMode')
              }}
            >
              <label
                class={ui.labeledInput}
                data-tour-target="pointInitMode-select"
              >
                <span>
                  <KeyframeDiamond parameterPath="pointInitMode" />
                  Point Init
                </span>
                <select
                  class={ui.select}
                  value={flameDescriptor.renderSettings.pointInitMode}
                  onChange={(ev) => {
                    const mode = ev.currentTarget.value
                    const update = () => {
                      setRenderSetting('pointInitMode', mode)
                    }
                    startViewTransition(update)
                  }}
                >
                  <For
                    each={recordKeys(
                      (flameDescriptor.renderSettings.dimensions ?? 2) === 3
                        ? pointInitMode3DToImplFn
                        : pointInitModeToImplFn,
                    )}
                  >
                    {(pointInitMode) => (
                      <option value={pointInitMode}>{pointInitMode}</option>
                    )}
                  </For>
                </select>
                <span></span>
              </label>
            </div>
            <div
              class={ui.parameterTarget}
              onClick={() => {
                setTargetedParameter('backgroundColor')
              }}
            >
              <label
                class={ui.labeledInput}
                data-tour-target="backgroundColor-picker"
              >
                <span>
                  <KeyframeDiamond parameterPath="backgroundColor" />
                  Background Color
                </span>
                <ColorPicker
                  value={
                    flameDescriptor.renderSettings.backgroundColor
                      ? vec3f(...flameDescriptor.renderSettings.backgroundColor)
                      : undefined
                  }
                  setValue={(newBgColor) => {
                    setRenderSetting('backgroundColor', newBgColor)
                  }}
                />
              </label>
            </div>
            <Show
              when={
                flameDescriptor.renderSettings.backgroundColor !== undefined
              }
              fallback={<span class={ui.noSelect} />}
            >
              <Button
                onClick={() => {
                  setRenderSetting('backgroundColor', null)
                }}
              >
                Auto
              </Button>
            </Show>
          </div>

          {/* -- Palette -- */}
          <div
            style={{ 'grid-column': '1 / -1' }}
            title={
              selectedPaletteId() === ''
                ? 'Select a palette in the gallery to enable these options'
                : undefined
            }
          >
            <div
              class={ui.settingsGroup}
              style={{
                opacity: selectedPaletteId() !== '' ? 1 : 0.4,
                'pointer-events': selectedPaletteId() !== '' ? 'auto' : 'none',
              }}
            >
              <span class={ui.settingsGroupLabel}>Palette</span>
              <div
                class={ui.parameterTarget}
                onClick={() => {
                  setTargetedParameter('paletteSpeed')
                }}
              >
                <Slider
                  label="Palette Speed"
                  value={flameDescriptor.renderSettings.paletteSpeed}
                  min={0}
                  max={10}
                  step={0.1}
                  onInput={(newVal) => {
                    setRenderSetting('paletteSpeed', newVal)
                  }}
                  formatValue={(value) => value.toFixed(1)}
                  dataParameterPath="paletteSpeed"
                  data-tour-target="paletteSpeed-slider"
                />
              </div>
              <div
                class={ui.parameterTarget}
                onClick={() => {
                  setTargetedParameter('paletteMode')
                }}
              >
                <label
                  class={ui.labeledInput}
                  data-tour-target="paletteMode-select"
                >
                  <span>Palette Mode</span>
                  <select
                    class={ui.select}
                    value={flameDescriptor.renderSettings.paletteMode ?? 0}
                    onChange={(ev) => {
                      const mode = parseInt(ev.currentTarget.value) as 0 | 1
                      setRenderSetting('paletteMode', mode)
                    }}
                  >
                    <option value={0}>Density Shift</option>
                    <option value={1}>Hue Rotation (flam3)</option>
                  </select>
                  <span></span>
                </label>
              </div>
              <div
                class={ui.parameterTarget}
                onClick={() => {
                  setTargetedParameter('palettePhase')
                }}
              >
                <Slider
                  label="Palette Phase"
                  value={flameDescriptor.renderSettings.palettePhase}
                  min={0}
                  max={1}
                  step={0.05}
                  onInput={(newVal) => {
                    setRenderSetting('palettePhase', newVal)
                  }}
                  formatValue={(value) => value.toFixed(2)}
                  dataParameterPath="palettePhase"
                  data-tour-target="palettePhase-slider"
                />
              </div>
            </div>
          </div>
        </Card>
      </CollapsibleCard>

      <CollapsibleCard
        title="Metadata"
        open={metadataCardOpen()}
        onToggleOpen={() => {
          setMetadataCardOpen((open) => !open)
        }}
        data-tour-target="metadata-card"
      >
        <Card>
          <div
            style={{
              display: 'flex',
              'flex-direction': 'column',
              gap: '0.5rem',
              width: '100%',
              'grid-column': '1 / -1',
            }}
          >
            <div>
              <label class={ui.metadataLabel}>Name</label>
              <input
                class={ui.metadataInput}
                data-parameter-path="metadata.name"
                type="text"
                placeholder="Flame Name"
                value={flameDescriptor.metadata?.name ?? ''}
                onInput={(e) => {
                  executeCommand(
                    'flame.setMetadata',
                    cmdContext,
                    'name',
                    e.currentTarget.value,
                  )
                }}
              />
            </div>
            <div>
              <label class={ui.metadataLabel}>Description</label>
              <textarea
                class={ui.metadataTextarea}
                data-parameter-path="metadata.description"
                placeholder="Description"
                value={flameDescriptor.metadata?.description ?? ''}
                onInput={(e) => {
                  executeCommand(
                    'flame.setMetadata',
                    cmdContext,
                    'description',
                    e.currentTarget.value,
                  )
                }}
              />
            </div>
            <div>
              <label class={ui.metadataLabel}>Author</label>
              <input
                class={ui.metadataInput}
                data-parameter-path="metadata.author"
                type="text"
                placeholder="Author"
                value={flameDescriptor.metadata?.author ?? ''}
                onInput={(e) => {
                  executeCommand(
                    'flame.setMetadata',
                    cmdContext,
                    'author',
                    e.currentTarget.value,
                  )
                }}
              />
            </div>
          </div>
        </Card>
      </CollapsibleCard>
    </>
  )
}
