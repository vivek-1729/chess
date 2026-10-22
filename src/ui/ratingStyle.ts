import type { RatingClass } from '../core/analysis/rating'

export const RATING_COLOR: Record<RatingClass, string> = {
  book: 'var(--r-book)',
  best: 'var(--r-best)',
  excellent: 'var(--r-excellent)',
  good: 'var(--r-good)',
  inaccuracy: 'var(--r-inaccuracy)',
  mistake: 'var(--r-mistake)',
  blunder: 'var(--r-blunder)',
}

export const RATING_SYMBOL: Record<RatingClass, string> = {
  book: '◆',
  best: '★',
  excellent: '!',
  good: '✓',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}
