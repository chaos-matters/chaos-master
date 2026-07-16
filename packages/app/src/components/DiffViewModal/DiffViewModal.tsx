import { createMemo, For, Show } from 'solid-js'
import { ModalTitleBar } from '@/components/Modal/ModalTitleBar'
import { diffFlames } from '@/flame/fdiff'
import ui from './DiffViewModal.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// ── Shared helpers ────────────────────────────────────────────────────────────

function pctStr(v: number): string {
  return `${Math.round(v * 100)}%`
}

function simColor(s: number): string {
  if (s >= 0.85) return '#4caf50'
  if (s >= 0.6) return '#ffc107'
  return '#f44336'
}

function fillStyle(s: number): string {
  return `width:${Math.round(s * 100)}%;background:${simColor(s)}`
}

function scoreColor(s: number): string {
  if (s >= 85) return '#4caf50'
  if (s >= 60) return '#ffc107'
  return '#f44336'
}

// ── Reusable diff content (shared by modal and sidebar panel) ──────────────────

export function DiffViewContent(props: {
  flameA: FlameDescriptor
  flameB: FlameDescriptor
}) {
  const nameA = () => props.flameA.metadata?.name || 'Flame A'
  const nameB = () => props.flameB.metadata?.name || 'Flame B'
  const diff = createMemo(() => diffFlames(props.flameA, props.flameB))

  return (
    <>
      {/* Flame names */}
      <div class={ui.flameNames}>
        <span class={ui.flameName}>{nameA()}</span>
        <span class={ui.flameVs}>vs</span>
        <span class={ui.flameName}>{nameB()}</span>
      </div>

      {/* Overall score */}
      <div class={ui.score}>
        <div
          class={ui.scoreCircle}
          style={{
            background: scoreColor(diff().overallSimilarity),
            color: '#fff',
          }}
        >
          {diff().overallSimilarity}%
        </div>
        <div class={ui.scoreLabel}>
          Overall structural similarity
          <br />
          <span
            style={{
              'font-size': '0.7rem',
              color: 'var(--color-text-muted)',
            }}
          >
            {(diff().weights.transforms * 100).toFixed(0)}% transforms ·{' '}
            {(diff().weights.render * 100).toFixed(0)}% render settings
          </span>
        </div>
      </div>

      {/* Render settings */}
      <div class={ui.section}>
        <h3 class={ui.sectionTitle}>
          Render Settings · {pctStr(diff().renderSimilarity)} match
        </h3>
        <div class={ui.renderGrid}>
          <For each={diff().renderDiffs}>
            {(d) => (
              <div class={ui.renderRow}>
                <span class={ui.renderLabel}>{d.label}</span>
                <span class={ui.renderValues}>
                  <span class={ui.renderVal}>
                    {Number.isInteger(d.valueA)
                      ? d.valueA
                      : d.valueA.toFixed(2)}
                  </span>
                  <span class={ui.renderArrow}>→</span>
                  <span class={ui.renderVal}>
                    {Number.isInteger(d.valueB)
                      ? d.valueB
                      : d.valueB.toFixed(2)}
                  </span>
                </span>
                <span
                  class={ui.renderSim}
                  style={{
                    color: simColor(d.similarity),
                    background: `${simColor(d.similarity)}18`,
                  }}
                >
                  {pctStr(d.similarity)}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Matched transforms */}
      <div class={ui.section}>
        <h3 class={ui.sectionTitle}>
          Transforms · {diff().matchedTransforms.length} matched
          <Show when={diff().unmatchedA.length + diff().unmatchedB.length > 0}>
            {' '}
            · {diff().unmatchedA.length + diff().unmatchedB.length} unmatched
          </Show>
        </h3>

        <div class={ui.matchList}>
          <For each={diff().matchedTransforms}>
            {(m) => (
              <div class={ui.matchRow}>
                <span class={ui.matchId} title={m.idA}>
                  {m.idA.slice(0, 8)}
                </span>
                <div class={ui.matchBars}>
                  <div class={ui.matchBarRow}>
                    <span class={ui.matchBarLabel}>Variations</span>
                    <div class={ui.matchBar}>
                      <div
                        class={ui.matchBarFill}
                        style={fillStyle(m.variationSimilarity)}
                      />
                    </div>
                  </div>
                  <div class={ui.matchBarRow}>
                    <span class={ui.matchBarLabel}>Affine</span>
                    <div class={ui.matchBar}>
                      <div
                        class={ui.matchBarFill}
                        style={fillStyle(m.affineSimilarity)}
                      />
                    </div>
                  </div>
                  <div class={ui.matchBarRow}>
                    <span class={ui.matchBarLabel}>Color</span>
                    <div class={ui.matchBar}>
                      <div
                        class={ui.matchBarFill}
                        style={fillStyle(m.colorSimilarity)}
                      />
                    </div>
                  </div>
                </div>
                <span class={ui.matchSim}>{pctStr(m.similarity)}</span>
                <span class={ui.matchId} title={m.idB}>
                  {m.idB.slice(0, 8)}
                </span>
              </div>
            )}
          </For>
        </div>

        {/* Unmatched */}
        <Show when={diff().unmatchedA.length > 0}>
          <div>
            <div class={ui.unmatchedLabel}>Only in {nameA()}:</div>
            <div class={ui.unmatched}>
              <For each={diff().unmatchedA}>
                {(id) => <span class={ui.unmatchedTag}>{id}</span>}
              </For>
            </div>
          </div>
        </Show>

        <Show when={diff().unmatchedB.length > 0}>
          <div>
            <div class={ui.unmatchedLabel}>Only in {nameB()}:</div>
            <div class={ui.unmatched}>
              <For each={diff().unmatchedB}>
                {(id) => <span class={ui.unmatchedTag}>{id}</span>}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </>
  )
}

// ── Standalone modal (wraps DiffViewContent) ───────────────────────────────────

export function DiffViewModal(props: {
  flameA: FlameDescriptor
  flameB: FlameDescriptor
  respond: () => void
}) {
  return (
    <div class={ui.modal}>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        <span>Flame Diff</span>
      </ModalTitleBar>

      <div class={ui.scroll}>
        <DiffViewContent flameA={props.flameA} flameB={props.flameB} />
      </div>
    </div>
  )
}
