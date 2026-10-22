import { Chess } from 'chess.js'
import table from './openings.json'

export type Opening = { eco: string; name: string }

const book = table as unknown as Record<string, [string, string]>

const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

export function lookupOpening(fen: string): Opening | null {
  const hit = book[key(fen)]
  return hit ? { eco: hit[0], name: hit[1] } : null
}

/** Legal moves from `fen` that land on a named opening position. */
export function bookMoves(fen: string): string[] {
  const chess = new Chess(fen)
  return chess.moves({ verbose: true }).filter((m) => book[key(m.after)]).map((m) => m.lan)
}
