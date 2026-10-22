import { Chess } from 'chess.js'
import type { Engine } from '../engine/Engine'
import { winPct } from '../analysis/eval'
import { bookMoves } from '../openings/openings'
import type { Bot } from './emperors'

type Strength = {
  depth: number
  multipv: number
  /** Softmax temperature in win-% points: higher means sloppier choices. */
  temperature: number
  /** Chance of picking any candidate regardless of how bad it is. */
  blunder: number
  /** Chance of an entirely random legal move. */
  random: number
  /** How many plies the bot follows opening theory for. */
  bookPlies: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Maps a rating onto engine settings. Hand-tuned, not calibrated. */
export function strengthFor(elo: number): Strength {
  const t = Math.max(0, Math.min(1, (elo - 400) / 1900)) // 400 → 0, 2300 → 1
  return {
    depth: Math.round(lerp(2, 16, t)),
    multipv: Math.round(lerp(10, 2, t)),
    temperature: lerp(30, 0.3, Math.pow(t, 0.6)),
    blunder: Math.max(0, lerp(0.25, -0.01, t)),
    random: Math.max(0, lerp(0.15, -0.1, t * 2)),
    bookPlies: Math.round(lerp(2, 12, t)),
  }
}

const MOVETIME = 250

/** Picks the bot's move. Returns UCI. */
export async function chooseBotMove(engine: Engine, bot: Bot, fen: string, rng = Math.random): Promise<string> {
  const s = strengthFor(bot.elo)
  const chess = new Chess(fen)
  const legal = chess.moves({ verbose: true })
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)]

  const ply = (Number(fen.split(' ')[5]) - 1) * 2 + (chess.turn() === 'b' ? 1 : 0)
  if (ply < s.bookPlies) {
    const book = bookMoves(fen)
    if (book.length > 0) return pick(book)
  }
  if (rng() < s.random) return pick(legal).lan

  const res = await engine.search(fen, { depth: s.depth, movetime: MOVETIME, multipv: s.multipv })
  const lines = res.lines.filter((l) => l.pv.length > 0)
  if (lines.length === 0) return res.bestmove ?? pick(legal).lan
  if (rng() < s.blunder) return pick(lines).pv[0]

  const byMove = new Map(legal.map((m) => [m.lan, m]))
  const scored = lines.map((l) => {
    const m = byMove.get(l.pv[0])
    let win = winPct(l.score)
    if (m && bot.style !== 'balanced') {
      const forcing = m.captured || m.san.includes('+') ? 1 : 0
      win += (bot.style === 'aggressive' ? 1 : -1) * forcing * 3
    }
    return { move: l.pv[0], win }
  })
  const top = Math.max(...scored.map((c) => c.win))
  const weights = scored.map((c) => Math.exp(-(top - c.win) / s.temperature))
  let r = rng() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i]
    if (r <= 0) return scored[i].move
  }
  return scored[0].move
}
