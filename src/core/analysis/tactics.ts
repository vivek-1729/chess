import { Chess, type PieceSymbol, type Square } from 'chess.js'
import type { PositionAnalysis } from './analyzer'
import { negate, winPct, type Color } from './eval'
import { attackers, attacks, firstTwoOnRay, material, PIECE_NAME, pieces, slideDirs, VALUE } from './geometry'

export type TacticTheme = 'mate' | 'fork' | 'pin' | 'skewer' | 'discovered' | 'hanging' | 'tactic' | 'defense'

export type Tactic = {
  /** Position in which the player can execute the tactic. */
  fen: string
  theme: TacticTheme
  /** Attack: you can win something. Defense: something of yours is under threat. */
  side: 'attack' | 'defense'
  /** Short name for notices and stats, e.g. "Knight fork" or "Win the exchange". */
  label: string
  /** What you're asked to do, e.g. "Win the exchange in 2" or "Save your knight". */
  goal: string
  /** A motif name ("Knight fork") the goal doesn't give away; revealed by the first hint. */
  motif?: string
  /** Defense only: what the opponent is threatening, in words. */
  threat?: string
  /** Short tactics are left silent; long ones are announced up front. */
  kind: 'short' | 'long'
  line: string[]
  /** How many of the player's own moves it takes until the gain is secured. */
  userMoves: number
  mateIn?: number
  bestWin: number
}

const MAX_MATE = 4
const MIN_WIN = 60
const MIN_GAP = 15
const MIN_CP_GAP = 250
/** Material (pawns) a line must win to count; 2 covers winning a rook for a knight. */
const MIN_GAIN = 2
/** Longest sequence of your own moves worth turning into a puzzle. */
const MAX_USER_MOVES = 4
const MAX_PLIES = 14
/** How many centipawns a move may give up and still count as finding the tactic. */
const MAX_CP_LOSS = 100
/** A defensive "only move": every alternative is at least this much worse. */
const DEFENSE_GAP = 20
const DEFENSE_CP_GAP = 200

/** Motifs worth announcing when they take a setup move to reach. */
const SETUP_NAME: Partial<Record<TacticTheme, string>> = {
  fork: 'Fork',
  pin: 'Pin',
  skewer: 'Skewer',
  discovered: 'Discovered attack',
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
const article = (p: PieceSymbol) => (p === 'q' ? 'the queen' : `a ${PIECE_NAME[p]}`)

export function parseUci(uci: string) {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? uci[4] : undefined,
  }
}

/**
 * Describes what a line nets you, e.g. "a rook for a knight" or "the queen".
 * Equal trades along the way (knight for bishop, rook for rook) cancel out;
 * `net` is the material gained, used when only pawns are left over.
 */
export function describeTrade(won: PieceSymbol[], lost: PieceSymbol[], net: number): string {
  const byValue = (xs: PieceSymbol[]) => xs.filter((p) => p !== 'p' && p !== 'k').sort((a, b) => VALUE[b] - VALUE[a])
  const w = byValue(won)
  const l = byValue(lost)
  for (let i = w.length - 1; i >= 0; i--) {
    const j = l.findIndex((p) => VALUE[p] === VALUE[w[i]])
    if (j >= 0) {
      w.splice(i, 1)
      l.splice(j, 1)
    }
  }
  if (!w[0] || VALUE[w[0]] - (l[0] ? VALUE[l[0]] : 0) < MIN_GAIN) return net >= 2 ? `${net} pawns` : 'material'
  if (!l[0]) return article(w[0])
  if (w[0] === 'r' && (l[0] === 'n' || l[0] === 'b')) return 'the exchange'
  return `${article(w[0])} for ${article(l[0])}`
}

/**
 * What the first hint reveals: the threat you're facing, or the motif name
 * when the goal doesn't already give it away.
 */
export const hiddenMotif = (t: Tactic) =>
  t.side === 'defense' ? t.threat : t.motif && !t.goal.includes(t.motif) ? t.motif : undefined

/**
 * Looks for something worth training in the position: first a forcing win
 * for the player, otherwise a threat they must answer. `prevFen` is the
 * position before the opponent's last move (the material baseline, so a plain
 * recapture doesn't count) and `lastMoveTo` is where that move landed.
 */
export function detectTactic(analysis: PositionAnalysis, prevFen: string | null, lastMoveTo?: string): Tactic | null {
  const [best] = analysis.lines
  if (!best) return null
  if (new Chess(analysis.fen).moves().length < 2) return null
  return detectAttack(analysis, prevFen) ?? detectThreat(analysis, prevFen, lastMoveTo)
}

/** Walks a line from `fen` and records material balance (for `me`) after each ply. */
function walkLine(fen: string, line: string[], me: Color, base: number) {
  const walk = new Chess(fen)
  const diffs: number[] = []
  const positions: string[] = []
  const captures: { by: Color; piece: PieceSymbol }[] = []
  for (const uci of line.slice(0, MAX_PLIES)) {
    positions.push(walk.fen())
    let mv
    try {
      mv = walk.move(parseUci(uci))
    } catch {
      break
    }
    captures.push(mv.captured ? { by: mv.color, piece: mv.captured } : { by: mv.color, piece: 'k' })
    diffs.push(material(walk, me) - material(walk, other(me)) - base)
  }
  return { diffs, positions, captures }
}

function detectAttack(analysis: PositionAnalysis, prevFen: string | null): Tactic | null {
  const [best, second] = analysis.lines
  const me = analysis.stm
  const bestWin = winPct(best.score)

  if (best.score.mate !== undefined) {
    const n = best.score.mate
    if (n <= 0 || n > MAX_MATE) return null
    return {
      fen: analysis.fen,
      theme: 'mate',
      side: 'attack',
      label: `Mate in ${n}`,
      goal: `Checkmate in ${n}`,
      kind: n <= 2 ? 'short' : 'long',
      line: best.pv,
      userMoves: n,
      mateIn: n,
      bestWin,
    }
  }

  // Worth flagging if it decides the game, or if it wins clearly more than any
  // alternative even when you're behind (winning material back still counts).
  const secondWin = second ? winPct(second.score) : 0
  const cpGap = second?.score.cp !== undefined && best.score.cp !== undefined ? best.score.cp - second.score.cp : Infinity
  const decisive = bestWin >= MIN_WIN && bestWin - secondWin >= MIN_GAP
  if (!decisive && cpGap < MIN_CP_GAP) return null

  const start = new Chess(analysis.fen)
  const base = material(prevFen ? new Chess(prevFen) : start, me) - material(prevFen ? new Chess(prevFen) : start, other(me))
  const { diffs, positions, captures } = walkLine(analysis.fen, best.pv, me, base)
  if (diffs.length < 2) return null

  // The tactic is done at the first of our moves after which, once the
  // opponent has replied, we're up material, as long as the line still ends
  // up ahead. Trades in between (they take, we take back) don't extend it.
  const end = Math.max(diffs[diffs.length - 1], diffs[diffs.length - 2])
  let secured = -1
  for (let i = 0; i < diffs.length; i += 2) {
    const afterReply = diffs[i + 1] ?? diffs[i]
    if (afterReply >= MIN_GAIN && end >= MIN_GAIN) {
      secured = i
      break
    }
  }
  if (secured < 0) return null
  const userMoves = secured / 2 + 1
  if (userMoves > MAX_USER_MOVES) return null

  const span = captures.slice(0, secured + 2).filter((c) => c.piece !== 'k')
  const prize = describeTrade(
    span.filter((c) => c.by === me).map((c) => c.piece),
    span.filter((c) => c.by !== me).map((c) => c.piece),
    diffs[secured + 1] ?? diffs[secured],
  )
  const winGoal = `Win ${prize}${userMoves > 1 ? ` in ${userMoves}` : ''}`

  // Name the motif if one of our moves along the way is recognisable.
  let theme: TacticTheme = 'tactic'
  let motif: string | undefined
  let setup = false
  for (let i = 0; i <= secured; i += 2) {
    const found = nameMove(positions[i], best.pv[i])
    if (!found) continue
    ;[theme, motif] = found
    if (i > 0 && SETUP_NAME[theme]) {
      // The motif only appears after a preparatory move: "Fork in 2".
      motif = `${SETUP_NAME[theme]} in ${i / 2 + 1}`
      setup = true
    } else if (i > 0) {
      theme = 'tactic'
      motif = undefined
    }
    break
  }

  return {
    fen: analysis.fen,
    theme,
    side: 'attack',
    label: motif ?? capitalize(winGoal.replace(/ in \d+$/, '')),
    goal: setup ? `${motif}: win ${prize}` : winGoal,
    motif,
    // Immediate named motifs (a fork, then taking what it hit) stay silent;
    // setups and unnamed multi-move wins get announced.
    kind: setup || userMoves >= 3 || (theme === 'tactic' && userMoves >= 2) ? 'long' : 'short',
    line: best.pv,
    userMoves,
    bestWin,
  }
}

/**
 * A defensive moment: one move holds the position and the alternatives lose
 * material or get mated. Skips plain recaptures and forced king moves.
 */
function detectThreat(analysis: PositionAnalysis, prevFen: string | null, lastMoveTo?: string): Tactic | null {
  const [best, second] = analysis.lines
  if (!second || best.score.mate !== undefined) return null
  const chess = new Chess(analysis.fen)
  if (chess.inCheck() && chess.moves().length <= 3) return null
  if (lastMoveTo && parseUci(best.move).to === lastMoveTo) return null

  const bestWin = winPct(best.score)
  const secondWin = winPct(second.score)
  const cpGap = second.score.cp !== undefined && best.score.cp !== undefined ? best.score.cp - second.score.cp : Infinity
  if (bestWin < 20 || bestWin - secondWin < DEFENSE_GAP || cpGap < DEFENSE_CP_GAP) return null

  // What goes wrong if you don't find it: replay the next-best line.
  const me = analysis.stm
  const base = material(prevFen ? new Chess(prevFen) : chess, me) - material(prevFen ? new Chess(prevFen) : chess, other(me))
  const walk = new Chess(analysis.fen)
  let threat: string | undefined
  let goal: string
  if (second.score.mate !== undefined && second.score.mate < 0) {
    goal = 'Stop the mate threat'
    let punish: string | undefined
    try {
      walk.move(parseUci(second.pv[0]))
      if (second.pv[1]) punish = walk.move(parseUci(second.pv[1])).san
    } catch {
      punish = undefined
    }
    threat = punish ? `${punish} starts a mating attack.` : 'You were about to get mated.'
  } else {
    let lostPiece: PieceSymbol | undefined
    for (const uci of second.pv.slice(0, 6)) {
      let mv
      try {
        mv = walk.move(parseUci(uci))
      } catch {
        break
      }
      if (mv.color !== me && mv.captured && mv.captured !== 'p') {
        lostPiece = mv.captured
        threat = `${mv.san} wins your ${PIECE_NAME[mv.captured]}.`
        break
      }
    }
    const lost = base - (material(walk, me) - material(walk, other(me)))
    if (!lostPiece && lost < MIN_GAIN) return null
    goal = lostPiece ? `Save your ${PIECE_NAME[lostPiece]}` : 'Avoid losing material'
  }

  return {
    fen: analysis.fen,
    theme: 'defense',
    side: 'defense',
    label: goal,
    goal,
    threat,
    kind: 'short',
    line: best.pv,
    userMoves: 1,
    bestWin,
  }
}

/** Names the motif behind a single move, if it's one we recognise. */
export function nameMove(fen: string, uci: string): [TacticTheme, string] | null {
  const before = new Chess(fen)
  const after = new Chess(fen)
  let mv
  try {
    mv = after.move(parseUci(uci))
  } catch {
    return null
  }
  const me = mv.color
  const opp = other(me)
  const mover = after.get(mv.to)
  if (!mover) return null
  const moverName = PIECE_NAME[mover.type]

  const isTarget = (sq: Square) => {
    const t = after.get(sq)
    if (!t || t.color !== opp) return false
    if (t.type === 'k' || VALUE[t.type] > VALUE[mover.type]) return true
    return t.type !== 'p' && attackers(after, sq, opp).length === 0
  }

  // Fork: the moved piece hits two worthwhile targets at once.
  if (attacks(after, mv.to).filter(isTarget).length >= 2) {
    return ['fork', `${capitalize(moverName)} fork`]
  }

  // Pin or skewer along the moved piece's lines.
  for (const [dx, dy] of slideDirs(mover.type)) {
    const [front, back] = firstTwoOnRay(after, mv.to, dx, dy)
    if (!front || !back || front.color !== opp || back.color !== opp) continue
    if (front.type !== 'k' && VALUE[back.type] > VALUE[front.type] && VALUE[mover.type] <= VALUE[back.type]) {
      return ['pin', back.type === 'k' ? 'Pin to the king' : `Pin to the ${PIECE_NAME[back.type]}`]
    }
    if ((front.type === 'k' || VALUE[front.type] > VALUE[back.type]) && back.type !== 'p') {
      return ['skewer', 'Skewer']
    }
  }

  // Discovered attack: moving out of the way unleashes another piece.
  for (const p of pieces(after, me)) {
    if (p.square === mv.to || slideDirs(p.type).length === 0) continue
    const was = new Set(attacks(before, p.square))
    const fresh = attacks(after, p.square).filter((sq) => !was.has(sq) && isTarget(sq))
    if (fresh.length > 0) {
      return ['discovered', after.get(fresh[0])?.type === 'k' ? 'Discovered check' : 'Discovered attack']
    }
  }

  // A piece left completely undefended.
  if (mv.captured && mv.captured !== 'p' && attackers(after, mv.to, opp).length === 0) {
    return ['hanging', `Free ${PIECE_NAME[mv.captured]}`]
  }
  return null
}

/**
 * Whether the player's move from `before` to `after` keeps the tactic's
 * advantage. When a forced mate was available it must still be forced and
 * at least one move closer; otherwise the winning chances must hold up.
 */
export function keepsTactic(before: PositionAnalysis, after: PositionAnalysis): boolean {
  if (after.lines.length === 0) return after.score.mate === 0 // we just delivered mate
  const mine = negate(after.score)
  const mateBefore = before.score.mate
  if (mateBefore !== undefined && mateBefore > 0) {
    return mine.mate !== undefined && mine.mate > 0 && mine.mate < mateBefore
  }
  if (mine.mate !== undefined) return mine.mate > 0
  if (winPct(mine) < winPct(before.score) - 10) return false
  // Winning chances flatten out when you're far ahead, so also require the
  // move to keep nearly all of the material edge (Nf6 instead of O-O+, giving
  // back a knight, still "wins" but isn't the tactic).
  const bestCp = before.score.cp ?? 0
  return bestCp - mine.cp! <= Math.max(MAX_CP_LOSS, Math.abs(bestCp) * 0.1)
}
