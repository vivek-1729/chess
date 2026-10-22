import type { PositionAnalysis } from './analyzer'
import { moveAccuracy, negate, winPct } from './eval'

export type RatingClass = 'book' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export type MoveRating = {
  cls: RatingClass
  /** How much the move lowered the mover's chance of winning, 0-100. */
  winDrop: number
  accuracy: number
  /** Engine's preferred move in the position before, in UCI. */
  best: string | null
}

export const RATING_LABEL: Record<RatingClass, string> = {
  book: 'Book move',
  best: 'Best move',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
}

/** Grades `move` by comparing the position before it with the one it produced. */
export function rateMove(
  before: PositionAnalysis,
  after: PositionAnalysis,
  move: string,
  isBook: boolean,
): MoveRating {
  const best = before.lines[0]?.move ?? null
  const bestWin = winPct(before.score)
  const afterWin = winPct(negate(after.score))
  const winDrop = Math.max(0, bestWin - afterWin)
  const accuracy = moveAccuracy(winDrop)

  let cls: RatingClass
  if (isBook && winDrop < 5) cls = 'book'
  else if (move === best || (after.lines.length === 0 && after.score.mate === 0)) cls = 'best'
  else if (winDrop < 2) cls = 'excellent'
  else if (winDrop < 5) cls = 'good'
  else if (winDrop < 10) cls = 'inaccuracy'
  else if (winDrop < 20) cls = 'mistake'
  else cls = 'blunder'

  return { cls, winDrop, accuracy, best }
}
