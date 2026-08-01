/**
 * Client for Home's settings — the `home_config` key/value table behind
 * `GET /api/gallery/config` (see worker/index.ts and migrations/0003).
 *
 * Everything here is written to survive content that disagrees with the build.
 * The settings are edited by hand (`gallery-admin config set`) against a
 * database that outlives any one deploy, so every value is treated as a
 * suggestion: unreachable, unset, empty and unknown all resolve to the same
 * built-in default rather than to an error. Home's portal must play SOMETHING.
 */

/** Which tour the "Made here" portal replays. */
export const PORTAL_TOUR_ID = 'portal_tour_id'

/**
 * Every key this build understands. Mirrored by `HOME_CONFIG_KEYS` in
 * scripts/home-config.mjs, which is what `gallery-admin config` allowlists —
 * the two are asserted equal by homeConfig.test.ts, so adding a key here
 * without teaching the admin tool about it fails the suite rather than
 * shipping a setting nothing can write.
 */
export const HOME_CONFIG_KEYS = [PORTAL_TOUR_ID] as const

export type HomeConfigKey = (typeof HOME_CONFIG_KEYS)[number]

/**
 * The stored map. Values are always text (D1 has no richer type here) and any
 * key may be absent — including keys this build has never heard of, which are
 * kept rather than dropped so a newer row is inert rather than fatal.
 */
export type HomeConfig = Partial<Record<string, string>>

/**
 * The tour the portal plays when nothing says otherwise. `example1-creation`
 * rebuilds First Light — the hero flame at the top of Home — so the portal
 * shows the flame at the top of the page being made (docs/plans/home-tab-plan.md,
 * Phase 5).
 */
export const DEFAULT_PORTAL_TOUR_ID = 'example1-creation'

export async function fetchHomeConfig(): Promise<HomeConfig> {
  const res = await fetch('/api/gallery/config')
  if (!res.ok) {
    // 503 means no content database is bound (a fresh environment, or a deploy
    // without the binding). Callers treat a throw the same as an empty map.
    throw new Error(`Home config unavailable (${res.status})`)
  }
  const body = (await res.json()) as { config?: HomeConfig }
  return body.config ?? {}
}

/**
 * Which tour id the portal should play.
 *
 * `isKnownTour` is injected rather than imported so this stays testable without
 * pulling in every tour definition, and so the caller decides what "known"
 * means — the app passes the tour registry's own lookup, which is the same one
 * the SpotlightTour system resolves ids through.
 *
 * A configured id that this build does not have is NOT an error: tours are
 * code, the row is content, and content can name a tour that was renamed or has
 * not shipped yet. That falls back to the default exactly like an unset key.
 */
export function resolvePortalTourId(
  config: HomeConfig | undefined,
  isKnownTour: (id: string) => boolean,
): string {
  const configured = config?.[PORTAL_TOUR_ID]?.trim()
  if (
    configured === undefined ||
    configured.length === 0 ||
    !isKnownTour(configured)
  ) {
    return DEFAULT_PORTAL_TOUR_ID
  }
  return configured
}
