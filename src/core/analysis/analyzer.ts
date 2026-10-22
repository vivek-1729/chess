import { Chess } from 'chess.js'
import type { Engine, Score } from '../engine/Engine'
import type { Color } from './eval'

export type AnalysisLine = {
  /** First move of the line in UCI notation. */
  move: string
  /** Score from the side to move's point of view. */
  score: Score
  pv: string[]
}

export type PositionAnalysis = {
  fen: string
  stm: Color
  /** Best line first. Empty when the game is over in this position. */
  lines: AnalysisLine[]
  /** Evaluation of the position from the side to move's point of view. */
  score: Score
}

const DEPTH = 14
const MOVETIME = 900
const MULTIPV = 3

/** Caches engine analysis per position so each FEN is searched only once. */
export class Analyzer {
  private cache = new Map<string, Promise<PositionAnalysis>>()
  private engine: Engine

  constructor(engine: Engine) {
    this.engine = engine
  }

  analyze(fen: string): Promise<PositionAnalysis> {
    let job = this.cache.get(fen)
    if (!job) {
      job = this.run(fen)
      this.cache.set(fen, job)
    }
    return job
  }

  peek(fen: string): Promise<PositionAnalysis> | undefined {
    return this.cache.get(fen)
  }

  private async run(fen: string): Promise<PositionAnalysis> {
    const chess = new Chess(fen)
    const stm = chess.turn()
    if (chess.isGameOver()) {
      return { fen, stm, lines: [], score: chess.isCheckmate() ? { mate: 0 } : { cp: 0 } }
    }
    const res = await this.engine.search(fen, { depth: DEPTH, movetime: MOVETIME, multipv: MULTIPV })
    const lines = res.lines
      .filter((l) => l.pv.length > 0)
      .map((l) => ({ move: l.pv[0], score: l.score, pv: l.pv }))
    if (lines.length === 0 && res.bestmove) lines.push({ move: res.bestmove, score: { cp: 0 }, pv: [res.bestmove] })
    return { fen, stm, lines, score: lines[0]?.score ?? { cp: 0 } }
  }
}
