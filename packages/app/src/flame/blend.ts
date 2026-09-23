/**
 * Blend composition defaults: the weight a new blend starts at.
 *
 * One number with two readers: the blend gallery's hover preview, which
 * shows a partner at this weight and commits its pick at it, and
 * `flame.setBlendFlame`, which gives it to a document that has no weight yet
 * when the caller names none. A replay lands on what the viewer saw only
 * while the two agree.
 */

/**
 * The weight a new blend starts at, 0 to 1 (the slider's 40%). It is the
 * share of the edited flame, not of the partner: the renderer iterates the
 * document's own transforms with this probability and the partner's the rest
 * of the time, so 0 draws the partner alone and a new partner shows at 60%.
 */
export const DEFAULT_BLEND_WEIGHT = 0.4
