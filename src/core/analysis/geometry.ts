// Minimal attack geometry on top of chess.js's board, used to name tactics.
import type { Chess, PieceSymbol, Square } from 'chess.js'
import type { Color } from './eval'

export type Piece = { type: PieceSymbol; color: Color; square: Square }

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

const toXY = (sq: Square): [number, number] => [sq.charCodeAt(0) - 97, Number(sq[1]) - 1]
const toSq = (x: number, y: number): Square | null =>
  x >= 0 && x < 8 && y >= 0 && y < 8 ? (`${String.fromCharCode(97 + x)}${y + 1}` as Square) : null

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

export function slideDirs(type: PieceSymbol): number[][] {
  if (type === 'r') return ROOK_DIRS
  if (type === 'b') return BISHOP_DIRS
  if (type === 'q') return [...ROOK_DIRS, ...BISHOP_DIRS]
  return []
}

export function pieces(chess: Chess, color?: Color): Piece[] {
  return chess
    .board()
    .flat()
    .filter((p): p is Piece => !!p && (!color || p.color === color))
}

/** Squares the piece on `sq` attacks (not necessarily legal moves). */
export function attacks(chess: Chess, sq: Square): Square[] {
  const piece = chess.get(sq)
  if (!piece) return []
  const [x, y] = toXY(sq)
  const out: Square[] = []
  const step = (deltas: number[][]) => {
    for (const [dx, dy] of deltas) {
      const t = toSq(x + dx, y + dy)
      if (t) out.push(t)
    }
  }
  if (piece.type === 'n') step(KNIGHT)
  else if (piece.type === 'k') step(KING)
  else if (piece.type === 'p') step(piece.color === 'w' ? [[1, 1], [-1, 1]] : [[1, -1], [-1, -1]])
  else {
    for (const [dx, dy] of slideDirs(piece.type)) {
      for (let i = 1; ; i++) {
        const t = toSq(x + dx * i, y + dy * i)
        if (!t) break
        out.push(t)
        if (chess.get(t)) break
      }
    }
  }
  return out
}

export function attackers(chess: Chess, target: Square, color: Color): Piece[] {
  return pieces(chess, color).filter((p) => attacks(chess, p.square).includes(target))
}

/** The first two pieces met walking from `from` in direction (dx, dy). */
export function firstTwoOnRay(chess: Chess, from: Square, dx: number, dy: number): Piece[] {
  const [x, y] = toXY(from)
  const found: Piece[] = []
  for (let i = 1; found.length < 2; i++) {
    const t = toSq(x + dx * i, y + dy * i)
    if (!t) break
    const p = chess.get(t)
    if (p) found.push({ ...p, square: t })
  }
  return found
}

export function material(chess: Chess, color: Color): number {
  return pieces(chess, color)
    .filter((p) => p.type !== 'k')
    .reduce((sum, p) => sum + VALUE[p.type], 0)
}
