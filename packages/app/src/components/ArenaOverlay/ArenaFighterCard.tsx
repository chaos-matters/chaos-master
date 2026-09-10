import { For, Show } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { calculateEffectivePower, TACTICAL_STANCES, } from '@/webmcp/tools/arenaArchetypes'
import ui from '../ArenaOverlay.module.css'
import { SCHOOL_COLORS } from './championCardCanvas'
import type { ArenaFighterStats } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { GroundedFlameStats } from '@/flame/stats'
import type { HardwareTier } from '@/utils/hardwareTier'
import type { OpponentArchetype, TacticalStance, } from '@/webmcp/tools/arenaArchetypes'

const PREVIEW_RES = { width: 380, height: 214 }

export function StatRow(props: {
  readonly label: string
  readonly value: number
  readonly max: number
  readonly color: string
}) {
  const percentage = () =>
    Math.min(100, Math.max(0, (props.value / props.max) * 100))

  return (
    <div class={ui.statRow}>
      <div class={ui.statLabels}>
        <span>{props.label}</span>
        <span>{Math.round(props.value)}</span>
      </div>
      <div class={ui.statTrack}>
        <div
          class={ui.statFill}
          style={{
            width: `${percentage()}%`,
            background: props.color,
          }}
        />
      </div>
    </div>
  )
}

function FighterStatsList(props: {
  readonly effectivePower: number
  readonly metrics?: ArenaFighterStats['metrics']
  readonly curStance:
    | (typeof TACTICAL_STANCES)[keyof typeof TACTICAL_STANCES]
    | null
  readonly symmetryScore: number
  readonly isP1: boolean
}) {
  const complexityMult = () =>
    props.curStance?.effects.complexityMultiplier ?? 1.0
  const chaosMult = () => props.curStance?.effects.chaosMultiplier ?? 1.0
  const symmetryMult = () => props.curStance?.effects.symmetryMultiplier ?? 1.0
  const energyMult = () => props.curStance?.effects.energyMultiplier ?? 1.0

  return (
    <div class={ui.statList}>
      <StatRow
        label="Power"
        value={props.effectivePower}
        max={2000}
        color={props.isP1 ? '#22d3ee' : '#fb923c'}
      />
      <StatRow
        label="Complexity"
        value={(props.metrics?.complexity || 0) * 10 * complexityMult()}
        max={100}
        color={props.isP1 ? '#60a5fa' : '#f87171'}
      />
      <StatRow
        label="Chaos"
        value={(props.metrics?.chaosLevel || 0) * 10 * chaosMult()}
        max={100}
        color={props.isP1 ? '#c084fc' : '#f472b6'}
      />
      <StatRow
        label="Symmetry"
        value={props.symmetryScore * 10 * symmetryMult()}
        max={100}
        color={props.isP1 ? '#818cf8' : '#facc15'}
      />
      <StatRow
        label="Energy"
        value={(props.metrics?.energyIntensity || 0) * 10 * energyMult()}
        max={100}
        color={props.isP1 ? '#2dd4bf' : '#fbbf24'}
      />
    </div>
  )
}

function FighterGroundedSection(props: {
  readonly grounded: GroundedFlameStats
  readonly onApplySymmetry: (order: number) => void
  readonly isClashing: boolean
}) {
  return (
    <>
      <div class={ui.groundedMetrics}>
        <div class={ui.groundedMetricItem} title="Moran similarity dimension">
          <span class={ui.groundedMetricKey}>Dim</span>
          <span class={ui.groundedMetricVal}>
            {props.grounded.dimension.toFixed(2)}
          </span>
        </div>
        <div
          class={ui.groundedMetricItem}
          title="Spectral stability / contractivity"
        >
          <span class={ui.groundedMetricKey}>Stab</span>
          <span class={ui.groundedMetricVal}>
            {Math.round(props.grounded.stability * 100)}%
          </span>
        </div>
        <div
          class={ui.groundedMetricItem}
          title="Shannon entropy of transform weights"
        >
          <span class={ui.groundedMetricKey}>Ent</span>
          <span class={ui.groundedMetricVal}>
            {props.grounded.entropy.toFixed(2)}
          </span>
        </div>
        <div class={ui.groundedMetricItem} title="Rotational symmetry order">
          <span class={ui.groundedMetricKey}>Sym</span>
          <span class={ui.groundedMetricVal}>
            C{props.grounded.symmetryOrder}
          </span>
        </div>
      </div>

      <div class={ui.symmetryRow}>
        <div class={ui.symmetryHeader}>
          <span class={ui.symmetryLabel}>Symmetry</span>
          <span class={ui.symmetryBadge}>C{props.grounded.symmetryOrder}</span>
        </div>
        <div class={ui.symmetryPills}>
          <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>
            {(order) => (
              <button
                type="button"
                class={ui.symmetryPill}
                classList={{
                  [ui.symmetryPillActive!]:
                    props.grounded.symmetryOrder === order,
                }}
                onClick={() => {
                  const targetOrder =
                    props.grounded.symmetryOrder === order ? 1 : order
                  props.onApplySymmetry(targetOrder)
                }}
                disabled={props.isClashing}
                aria-label={
                  order === 1
                    ? 'Reset symmetry to C1'
                    : `Set ${order}-fold rotational symmetry`
                }
                title={
                  order === 1
                    ? 'Reset symmetry to C1'
                    : `Set ${order}-fold rotational symmetry`
                }
              >
                C{order}
              </button>
            )}
          </For>
        </div>
      </div>
    </>
  )
}

function FighterStanceSection(props: {
  readonly stance?: TacticalStance
  readonly onSetStance?: (stance: TacticalStance) => void
  readonly isClashing: boolean
}) {
  return (
    <div class={ui.stanceContainer}>
      <div class={ui.stanceTitle}>Tactical Stance</div>
      <div class={ui.stanceGrid}>
        <For each={Object.values(TACTICAL_STANCES)}>
          {(s) => (
            <button
              class={ui.stanceBtn}
              classList={{
                [ui.stanceBtnActive!]: props.stance === s.id,
              }}
              onClick={() => {
                props.onSetStance?.(s.id)
              }}
              disabled={props.isClashing}
              title={s.description}
            >
              <span class={ui.stanceName}>{s.name}</span>
              <span class={ui.stanceTagline}>{s.tagline}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}

export interface ArenaFighterCardProps {
  readonly player: 1 | 2
  readonly fighter: ArenaFighterStats
  readonly grounded: GroundedFlameStats | null
  readonly advantage: number
  readonly isWinner: boolean
  readonly previewFlame: FlameDescriptor | null
  readonly version: number
  readonly hardwareTier?: HardwareTier | null
  readonly gameState: 'idle' | 'clashing' | 'results'
  readonly onLoad: () => void
  readonly onApplySymmetry: (order: number) => void
  readonly onOpenGallery: () => void
  readonly stance?: TacticalStance
  readonly onSetStance?: (stance: TacticalStance) => void
  readonly onSyncActiveFlame?: () => void
  readonly opponentArchetype?: OpponentArchetype
  readonly onRerollOpponent?: () => void
}

export function ArenaFighterCard(props: ArenaFighterCardProps) {
  const isP1 = () => props.player === 1
  const isClashing = () => props.gameState === 'clashing'
  const curStance = () =>
    props.stance
      ? (TACTICAL_STANCES[props.stance] ?? TACTICAL_STANCES.balanced)
      : null

  const effectivePower = () =>
    props.stance
      ? calculateEffectivePower(props.fighter.powerLevel || 0, props.stance)
      : props.fighter.powerLevel || 0

  const symmetryScore = () => {
    const mSym = props.fighter.metrics?.symmetryScore ?? 0
    const gOrder = props.grounded?.symmetryOrder ?? 1
    const gSym = gOrder >= 2 ? 2.5 + (gOrder - 2) * 1.25 : 0
    return Math.max(mSym, gSym)
  }

  const fighterClassName = () => {
    if (isP1()) {
      return `Class: ${props.fighter.type || 'Fractal Guardian'}`
    }
    return `Archetype: ${props.fighter.type || props.opponentArchetype?.className || 'Fractal Guardian'}`
  }

  return (
    <div
      class={`${ui.fighterCard} ${isP1() ? ui.p1Card : ui.p2Card}`}
      classList={{
        [ui.p1CardWinner!]: isP1() && props.isWinner,
        [ui.p2CardWinner!]: !isP1() && props.isWinner,
      }}
    >
      <div class={ui.fighterPreview}>
        <Show
          when={props.previewFlame}
          fallback={
            <div class={ui.fighterPreviewInner}>
              <span class={ui.fighterLabel}>
                {props.fighter.name ?? (isP1() ? 'Player 1' : 'Player 2')}
              </span>
            </div>
          }
        >
          {(f) => (
            <div class={ui.previewLayer}>
              <VariationPreview
                version={props.version}
                isSelected={props.isWinner}
                flame={f()}
                name={props.fighter.name ?? (isP1() ? 'Player 1' : 'Player 2')}
                resolution={PREVIEW_RES}
                hardwareTier={props.hardwareTier}
                snapshotOnly
              />
            </div>
          )}
        </Show>

        <Show when={props.isWinner}>
          <div class={ui.victorBadge}>VICTOR</div>
        </Show>
      </div>

      <div class={ui.fighterHeader}>
        <div>
          <div class={ui.fighterTitleRow}>
            <div class={`${ui.fighterName} ${isP1() ? ui.p1Name : ui.p2Name}`}>
              {props.fighter.name ?? (isP1() ? 'Player 1' : 'Player 2')}
            </div>
            <Show when={props.grounded?.school}>
              {(sch) => (
                <span
                  class={ui.schoolBadge}
                  style={{
                    'background-color': SCHOOL_COLORS[sch()].bg,
                    color: SCHOOL_COLORS[sch()].text,
                    'border-color': SCHOOL_COLORS[sch()].border,
                  }}
                >
                  {sch()}
                </span>
              )}
            </Show>
            <Show when={props.advantage > 1.0}>
              <span class={ui.advantageBadge}>
                +{Math.round((props.advantage - 1) * 100)}%
              </span>
            </Show>
          </div>
          <div class={ui.fighterClass}>{fighterClassName()}</div>
        </div>
        <Show when={props.fighter.flame}>
          <button
            class={ui.loadBtn}
            onClick={props.onLoad}
            title="Load this flame into main workspace"
          >
            Load
          </button>
        </Show>
      </div>

      <FighterStatsList
        effectivePower={effectivePower()}
        metrics={props.fighter.metrics}
        curStance={curStance()}
        symmetryScore={symmetryScore()}
        isP1={isP1()}
      />

      <Show when={props.grounded}>
        {(g) => (
          <FighterGroundedSection
            grounded={g()}
            onApplySymmetry={props.onApplySymmetry}
            isClashing={isClashing()}
          />
        )}
      </Show>

      {/* Player 1: Tactical Stance Selector */}
      <Show when={isP1() && props.onSetStance}>
        <FighterStanceSection
          stance={props.stance}
          onSetStance={props.onSetStance}
          isClashing={isClashing()}
        />
      </Show>

      {/* Player 2: Opponent Lore Box */}
      <Show when={!isP1() && props.opponentArchetype}>
        {(arch) => <div class={ui.opponentLoreBox}>{arch().lore}</div>}
      </Show>

      {/* Footer Action Buttons */}
      <div class={ui.cardFooterActions}>
        <Show
          when={isP1()}
          fallback={
            <button
              type="button"
              class={ui.rerollBtn}
              onClick={props.onRerollOpponent}
              disabled={isClashing()}
              title="Generate new opponent archetype (R)"
            >
              <span>Reroll Opponent</span>
            </button>
          }
        >
          <button
            type="button"
            class={ui.syncBtn}
            onClick={props.onSyncActiveFlame}
            disabled={isClashing()}
            title="Sync active flame from editor into Player 1"
            aria-label="Sync active flame"
          >
            Sync Active
          </button>
        </Show>
        <button
          type="button"
          class={ui.galleryBtn}
          onClick={props.onOpenGallery}
          disabled={isClashing()}
          title={`Pick flame for ${isP1() ? 'Player 1' : 'Player 2'} from gallery`}
        >
          <span>From Gallery</span>
        </button>
      </div>
    </div>
  )
}
