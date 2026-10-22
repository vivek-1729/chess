import type { Score } from '../engine/Engine'

export type Color = 'w' | 'b'

/** Flips a side-to-move score to the other side's point of view. */
export function negate(score: Score): Score {
  return score.mate !== undefined ? { mate: -score.mate } : { cp: -score.cp }
}

/** Re-expresses a score given from `stm`'s view as `pov`'s view. */
export function forColor(score: Score, stm: Color, pov: Color): Score {
  return stm === pov ? score : negate(score)
}

/**
 * Chance of winning (0-100) for the side the score belongs to. Uses Lichess's
 * calibration, which treats +8 vs +6 as nearly identical but +1 vs -1 as huge.
 */
export function winPct(score: Score): number {
  if (score.mate !== undefined) {
    if (score.mate === 0) return 0 // side to move has been mated
    return score.mate > 0 ? 100 : 0
  }
  const cp = Math.max(-1000, Math.min(1000, score.cp))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Lichess's per-move accuracy from the drop in win percentage. */
export function moveAccuracy(winDrop: number): number {
  const acc = 103.1668 * Math.exp(-0.04354 * Math.max(0, winDrop)) - 3.1669
  return Math.max(0, Math.min(100, acc))
}

export function formatScore(score: Score): string {
  if (score.mate !== undefined) return `M${Math.abs(score.mate)}`
  const v = score.cp / 100
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`
}
