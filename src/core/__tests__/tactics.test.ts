import { afterAll, describe, expect, it } from 'vitest'
import { Analyzer } from '../analysis/analyzer'
import { Chess } from 'chess.js'
import { detectTactic, keepsTactic } from '../analysis/tactics'
import type { PositionAnalysis } from '../analysis/analyzer'
import { nodeEngine } from './nodeEngine'

const engine = nodeEngine()
const analyzer = new Analyzer(engine)
afterAll(() => engine.terminate())

const detect = async (fen: string, prev: string | null = null) => detectTactic(await analyzer.analyze(fen), prev)

describe('detectTactic', () => {
  it('ignores the starting position', async () => {
    expect(await detect('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBeNull()
  })
  it('finds a knight fork', async () => {
    const t = await detect('r3k3/pp1p4/8/3N4/8/8/PPPP4/4K3 w - - 0 1')
    expect(t?.theme).toBe('fork')
    expect(t?.kind).toBe('short')
  })
  it('finds mate in one', async () => {
    const t = await detect('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1')
    expect(t?.label).toBe('Mate in 1')
    expect(t?.kind).toBe('short')
  })
  it('finds a skewer', async () => {
    const t = await detect('6q1/5k2/p7/8/8/8/PP2B3/K7 w - - 0 1')
    expect(t?.theme).toBe('skewer')
  })
  it('finds a pin', async () => {
    const t = await detect('6k1/ppp3pp/4q3/8/8/1P6/P1P2PPP/5BK1 w - - 0 1')
    expect(t?.theme).toBe('pin')
  })
  it('finds a free piece', async () => {
    const t = await detect('4k3/pppp4/8/8/3q4/5N2/PPPP4/4K3 w - - 0 1')
    expect(t?.label).toBe('Free queen')
  })
  it('does not count a plain recapture', async () => {
    // Black just played Nxe4 taking a knight; Nxe4 back is not a tactic.
    const prev = 'rnbqkb1r/pppp1ppp/8/4p3/2N1n3/8/PPPPPPPP/R1BQKBNR b KQkq - 0 1'
    const now = 'rnbqkb1r/pppp1ppp/8/4p3/2N1n3/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1'
    expect(await detect(now, prev)).toBeNull()
  })
  it('flags a longer mate as long', async () => {
    const t = await detect('7k/8/5K2/8/8/8/8/1Q6 w - - 0 1')
    expect(t?.theme).toBe('mate')
  })

  it('announces a fork that needs a setup move as "Fork in 2"', () => {
    // Nd5 first, then Nc7+ forks king and rook, then Nxa8.
    const fen = 'r3k3/pp1p3p/8/8/1N6/8/PPPP4/4K3 w - - 0 1'
    const analysis: PositionAnalysis = {
      fen,
      stm: 'w',
      score: { cp: 500 },
      lines: [
        { move: 'b4d5', score: { cp: 500 }, pv: ['b4d5', 'h7h6', 'd5c7', 'e8d8', 'c7a8', 'd8c8'] },
        { move: 'b2b3', score: { cp: 0 }, pv: ['b2b3'] },
      ],
    }
    const t = detectTactic(analysis, null)
    expect(t?.label).toBe('Fork in 2')
    expect(t?.theme).toBe('fork')
    expect(t?.kind).toBe('long')
  })
  it('keeps an immediate fork silent', async () => {
    const t = await detect('r3k3/pp1p4/8/3N4/8/8/PPPP4/4K3 w - - 0 1')
    expect(t?.label).toBe('Knight fork')
    expect(t?.kind).toBe('short')
  })

  it('does not accept a move that stays winning but drops the tactic', async () => {
    // From a real game: after 16...Rg8, O-O+ wins the queen; Nf6 just gives back a knight.
    const c = new Chess()
    for (const m of 'e4 g6 d4 Bg7 Be2 c5 d5 Na6 h4 d6 h5 gxh5 Nh3 h6 Nf4 Nf6 Nxh5 Kf8 Nxg7 e6 Nh5 Nxe4 Nc3 e5 Nxe4 f5 f4 b5 fxe5 fxe4 e6 Rg8'.split(' ')) c.move(m)
    const fen = c.fen()
    const before = await analyzer.analyze(fen)
    const after = (san: string) => {
      const t = new Chess(fen)
      t.move(san)
      return analyzer.analyze(t.fen())
    }
    expect(keepsTactic(before, await after('O-O'))).toBe(true)
    expect(keepsTactic(before, await after('Nf6'))).toBe(false)
  })

  it('ends a tactic once the material is secured, ignoring later trades', () => {
    // Nxd7 Kxd7 wins a rook for a knight; the pawn trade after it doesn't extend the puzzle.
    const fen = '4k3/3r4/8/3pN3/2P5/1P6/8/4K3 w - - 0 1'
    const analysis: PositionAnalysis = {
      fen,
      stm: 'w',
      score: { cp: 300 },
      lines: [
        { move: 'e5d7', score: { cp: 300 }, pv: ['e5d7', 'e8d7', 'e1d2', 'd5c4', 'b3c4'] },
        { move: 'e1d2', score: { cp: 0 }, pv: ['e1d2'] },
      ],
    }
    const t = detectTactic(analysis, null)
    expect(t?.userMoves).toBe(1)
    expect(t?.goal).toBe('Win the exchange')
    expect(t?.kind).toBe('short')
  })
  it('spots a threat you have to answer', () => {
    // The b4 pawn attacks the knight on c3; anything but moving it loses the knight.
    const fen = '4k3/8/8/8/1p6/2N5/P7/4K3 w - - 0 1'
    const analysis: PositionAnalysis = {
      fen,
      stm: 'w',
      score: { cp: 0 },
      lines: [
        { move: 'c3e4', score: { cp: 0 }, pv: ['c3e4', 'e8d7'] },
        { move: 'a2a3', score: { cp: -300 }, pv: ['a2a3', 'b4c3'] },
      ],
    }
    const t = detectTactic(analysis, null)
    expect(t?.side).toBe('defense')
    expect(t?.goal).toBe('Save your knight')
    expect(t?.threat).toBe('bxc3 wins your knight.')
  })
  it('ignores a plain recapture as a defensive moment', () => {
    const fen = '4k3/8/8/8/1p6/2N5/P7/4K3 w - - 0 1'
    const analysis: PositionAnalysis = {
      fen,
      stm: 'w',
      score: { cp: 0 },
      lines: [
        { move: 'c3e4', score: { cp: 0 }, pv: ['c3e4'] },
        { move: 'a2a3', score: { cp: -300 }, pv: ['a2a3', 'b4c3'] },
      ],
    }
    expect(detectTactic(analysis, null, 'e4')).toBeNull()
  })
})
