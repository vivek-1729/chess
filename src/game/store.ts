import { Chess, DEFAULT_POSITION, type Square } from 'chess.js'
import { create } from 'zustand'
import { Analyzer, type PositionAnalysis } from '../core/analysis/analyzer'
import { rateMove, type MoveRating } from '../core/analysis/rating'
import { detectTactic, hiddenMotif, keepsTactic, parseUci, type Tactic } from '../core/analysis/tactics'
import { botById, type Bot } from '../core/bots/emperors'
import { chooseBotMove } from '../core/bots/player'
import { Engine } from '../core/engine/Engine'
import { lookupOpening, type Opening } from '../core/openings/openings'
import { saveGame, type GameRecord } from '../storage/storage'

export type Color = 'w' | 'b'

export type Ply = {
  san: string
  uci: string
  from: Square
  to: Square
  fenBefore: string
  fenAfter: string
  color: Color
  by: 'user' | 'bot'
  rating?: MoveRating
}

export type Notice =
  | { kind: 'missed'; tactic: Tactic; ply: number }
  | { kind: 'found'; tactic: Tactic }
  | { kind: 'solved'; tactic: Tactic }
  | { kind: 'idea'; tactic: Tactic }

export type Puzzle = {
  tactic: Tactic
  movesLeft: number
  feedback: 'checking' | 'wrong' | 'correct' | null
  hint: 0 | 1 | 2
  reveal: boolean
  /** Best move in the current puzzle position, once known. */
  bestNow: string | null
}

export type RedoStep = { plies: Ply[]; log: GameRecord['tactics'] }

export type Result = { winner: 'user' | 'bot' | 'draw'; reason: string }

type State = {
  screen: 'home' | 'game' | 'stats'
  bot: Bot
  userColor: Color
  plies: Ply[]
  status: 'playing' | 'over'
  result: Result | null
  opening: Opening | null
  botThinking: boolean
  /** Index of the ply being inspected, or null for the live position. */
  viewPly: number | null
  /** A long combination announced before the player moves. */
  flag: Tactic | null
  notice: Notice | null
  puzzle: Puzzle | null
  tacticLog: GameRecord['tactics']
  /** Taken-back moves (yours plus the bot's reply), most recent last, so › replays them exactly. */
  redo: RedoStep[]
  /** Best move shown on request; `move` is null while the engine thinks. */
  hint: { fen: string; move: string | null } | null
}

type Actions = {
  startGame(botId: string, color: Color): void
  userMove(from: Square, to: Square, promotion?: string): boolean
  rewind(): void
  tryFlag(): void
  skipFlag(): void
  dismissNotice(): void
  puzzleHint(): void
  puzzleReveal(): void
  puzzleGiveUp(): void
  takeback(): void
  /** Goes back to before ply `index` and plays the engine's best move instead. */
  playBest(index: number): void
  redoMove(): void
  showHint(): void
  resign(): void
  setView(ply: number | null): void
  goHome(): void
  showStats(): void
}

// A short, slightly varied pause so the bot's reply doesn't feel instant.
const botDelay = () => 700 + Math.random() * 500

// Two engines: one plays, one analyses, so rating never slows the bot down.
let botEngine: Engine | null = null
let analyzer: Analyzer | null = null
const engines = () => {
  botEngine ??= new Engine()
  analyzer ??= new Analyzer(new Engine())
  return { botEngine, analyzer }
}

/** Bumped whenever the game is reset or rewound so stale async work is dropped. */
let epoch = 0

/** Positions where you asked for a hint; tactics there don't count as found or missed. */
const hinted = new Set<string>()

/** Engine analysis of any position (shares the cache with the game). */
export const analyzePosition = (fen: string) => engines().analyzer.analyze(fen)

export const currentFen = (plies: Ply[]) => (plies.length ? plies[plies.length - 1].fenAfter : DEFAULT_POSITION)

function replay(plies: Ply[]): Chess {
  const chess = new Chess()
  for (const p of plies) chess.move(parseUci(p.uci))
  return chess
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const useGame = create<State & Actions>((set, get) => {
  const stale = (e: number) => e !== epoch || get().screen !== 'game'

  const push = (uci: string, by: Ply['by']): Ply | null => {
    const { plies } = get()
    const chess = replay(plies)
    const fenBefore = chess.fen()
    let mv
    try {
      mv = chess.move(parseUci(uci))
    } catch {
      return null
    }
    const ply: Ply = {
      san: mv.san,
      uci: mv.lan,
      from: mv.from,
      to: mv.to,
      fenBefore,
      fenAfter: chess.fen(),
      color: mv.color,
      by,
    }
    const opening = lookupOpening(ply.fenAfter) ?? get().opening
    set({ plies: [...plies, ply], opening, viewPly: null, hint: null })
    if (chess.isGameOver()) finish(chess)
    return ply
  }

  const finish = (chess: Chess, resigned = false) => {
    const { userColor } = get()
    let result: Result
    if (resigned) result = { winner: 'bot', reason: 'resignation' }
    else if (chess.isCheckmate()) result = { winner: chess.turn() === userColor ? 'bot' : 'user', reason: 'checkmate' }
    else if (chess.isStalemate()) result = { winner: 'draw', reason: 'stalemate' }
    else if (chess.isThreefoldRepetition()) result = { winner: 'draw', reason: 'repetition' }
    else if (chess.isInsufficientMaterial()) result = { winner: 'draw', reason: 'insufficient material' }
    else result = { winner: 'draw', reason: '50-move rule' }
    set({ status: 'over', result, flag: null, puzzle: null, botThinking: false })
    void record(chess, result, epoch)
  }

  const record = async (chess: Chess, result: Result, e: number) => {
    // Let the last move's rating land before computing accuracy.
    await sleep(2500)
    const { bot, userColor, plies, opening, tacticLog } = get()
    if (e !== epoch || get().status !== 'over') return
    const rated = plies.filter((p) => p.by === 'user' && p.rating)
    chess.header('White', userColor === 'w' ? 'You' : bot.name, 'Black', userColor === 'b' ? 'You' : bot.name)
    saveGame({
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      botId: bot.id,
      userColor,
      result: result.winner === 'user' ? 'win' : result.winner === 'bot' ? 'loss' : 'draw',
      reason: result.reason,
      pgn: chess.pgn(),
      accuracy: rated.length ? rated.reduce((s, p) => s + p.rating!.accuracy, 0) / rated.length : null,
      opening: opening?.name ?? null,
      tactics: tacticLog,
    })
  }

  const setRating = (index: number, fenAfter: string, rating: MoveRating) => {
    const plies = get().plies
    if (plies[index]?.fenAfter !== fenAfter) return
    const next = [...plies]
    next[index] = { ...plies[index], rating }
    set({ plies: next })
  }

  /** Material baseline for tactic detection: the position before the bot's last move. */
  const prevFenFor = (index: number) => {
    const prev = get().plies[index - 1]
    return prev && prev.by === 'bot' ? prev.fenBefore : null
  }

  /** Tactics in the position before ply `index`, given the bot's move that led there. */
  const tacticAt = (analysis: PositionAnalysis, index: number) => {
    const prev = get().plies[index - 1]
    return detectTactic(analysis, prevFenFor(index), prev?.by === 'bot' ? prev.to : undefined)
  }

  const rate = async (index: number) => {
    const ply = get().plies[index]
    const { analyzer } = engines()
    const [before, after] = await Promise.all([analyzer.analyze(ply.fenBefore), analyzer.analyze(ply.fenAfter)])
    setRating(index, ply.fenAfter, rateMove(before, after, ply.uci, !!lookupOpening(ply.fenAfter)))
    return { before, after }
  }

  /** Verdicts still being worked out, by ply, so the next turn can wait for them. */
  const judging = new Map<number, Promise<void>>()

  /** After a normal move, check whether a tactic was available and found. */
  const judgeOpportunity = (index: number, e: number) => {
    const job = judge(index, e)
    judging.set(index, job)
    return job
  }

  const judge = async (index: number, e: number) => {
    const ply = get().plies[index]
    const { before, after } = await rate(index)
    if (stale(e)) return
    const tactic = tacticAt(before, index)
    if (!tactic || hinted.has(ply.fenBefore)) return
    const found = keepsTactic(before, after)
    // Missing the same winning chance move after move (say, a mate you're not
    // seeing) is logged but only announced the first time.
    // Likewise, each step of a combination you're already playing (mate in 3,
    // then mate in 2...) is only announced at the start.
    const repeat = get().tacticLog.some((t) => t.ply === index - 2 && t.found === found)
    set((s) => ({
      tacticLog: [...s.tacticLog, { theme: tactic.theme, label: tactic.label, found, ply: index }],
      notice:
        s.plies[index]?.fenAfter !== ply.fenAfter || repeat
          ? s.notice
          : found
            ? { kind: 'found', tactic }
            : { kind: 'missed', tactic, ply: index },
    }))
  }

  const onUserTurn = async (e: number) => {
    const fen = currentFen(get().plies)
    const analysis = await engines().analyzer.analyze(fen)
    if (stale(e) || currentFen(get().plies) !== fen) return
    const { puzzle } = get()
    if (puzzle) {
      set({ puzzle: { ...puzzle, bestNow: analysis.lines[0]?.move ?? null } })
      return
    }
    const len = get().plies.length
    await judging.get(len - 2)
    if (stale(e) || currentFen(get().plies) !== fen) return
    const tactic = tacticAt(analysis, len)
    // Don't re-announce a combination you're in the middle of playing.
    const continuing = get().tacticLog.some((t) => t.ply === len - 2 && t.found)
    if (tactic?.kind === 'long' && !continuing) set({ flag: tactic })
  }

  const botMove = async (e: number) => {
    const { bot } = get()
    const fen = currentFen(get().plies)
    set({ botThinking: true })
    const started = Date.now()
    let uci: string | null = null
    try {
      uci = await chooseBotMove(engines().botEngine, bot, fen)
    } catch (err) {
      console.error('bot move failed', err)
    }
    // Analyse the position you'll face during the pause, so a "Fork in 2" or
    // "Mate in 3" flag is ready the moment the bot's move appears.
    let next: string | null = null
    try {
      if (uci) {
        const c = new Chess(fen)
        c.move(parseUci(uci))
        next = c.fen()
      }
    } catch {
      next = null
    }
    const pause = sleep(Math.max(0, botDelay() - (Date.now() - started)))
    await Promise.all([pause, next ? Promise.race([engines().analyzer.analyze(next), sleep(2500)]) : pause])
    if (stale(e) || currentFen(get().plies) !== fen) return
    set({ botThinking: false })
    if (!uci || !push(uci, 'bot')) {
      // Never leave the game stuck on the bot's turn.
      const legal = new Chess(fen).moves({ verbose: true })
      console.error('bot produced unusable move', uci, fen)
      push(legal[Math.floor(Math.random() * legal.length)].lan, 'bot')
    }
    if (get().status === 'playing') void onUserTurn(e)
  }

  /** Best defence during a puzzle, so the line plays out as the engine sees it. */
  const puzzleReply = async (after: PositionAnalysis, e: number) => {
    set({ botThinking: true })
    await sleep(botDelay())
    if (stale(e)) return
    set({ botThinking: false })
    const reply = after.lines[0]?.move
    if (!reply) return
    push(reply, 'bot')
    if (get().status === 'playing') void onUserTurn(e)
  }

  const puzzleMove = async (index: number, puzzle: Puzzle, e: number) => {
    const ply = get().plies[index]
    const { analyzer } = engines()
    const before = await analyzer.analyze(ply.fenBefore)
    const quick = before.lines[0]?.move === ply.uci
    const after = await analyzer.analyze(ply.fenAfter)
    if (stale(e)) return

    if (!quick && !keepsTactic(before, after)) {
      // Snap back to the frozen position (even if the wrong move ended the game).
      set((s) => ({
        plies: s.plies.slice(0, index),
        status: 'playing',
        result: null,
        puzzle: { ...puzzle, feedback: 'wrong', reveal: false },
      }))
      void onUserTurn(e)
      return
    }

    void rate(index)
    const movesLeft = puzzle.movesLeft - 1
    if (movesLeft <= 0 || get().status === 'over') {
      set({ puzzle: null, notice: { kind: 'solved', tactic: puzzle.tactic } })
      if (get().status === 'playing') void botMove(e)
      return
    }
    set({ puzzle: { ...puzzle, movesLeft, feedback: 'correct', hint: 0, reveal: false, bestNow: null } })
    void puzzleReply(after, e)
  }

  const startPuzzle = (tactic: Tactic) => {
    set({
      flag: null,
      notice: null,
      viewPly: null,
      puzzle: { tactic, movesLeft: tactic.userMoves, feedback: null, hint: 0, reveal: false, bestNow: tactic.line[0] ?? null },
    })
  }

  /** Rewinds the game to just before ply `i`, dropping everything after it. */
  const truncate = (i: number) => {
    epoch++
    set((s) => ({
      plies: s.plies.slice(0, i),
      status: 'playing',
      result: null,
      botThinking: false,
      viewPly: null,
      flag: null,
      notice: null,
      hint: null,
      tacticLog: s.tacticLog.filter((t) => t.ply === undefined || t.ply < i),
    }))
    let opening: Opening | null = null
    for (const p of get().plies) opening = lookupOpening(p.fenAfter) ?? opening
    set({ opening })
  }

  return {
    screen: 'home',
    bot: botById('claudius'),
    userColor: 'w',
    plies: [],
    status: 'playing',
    result: null,
    opening: null,
    botThinking: false,
    viewPly: null,
    flag: null,
    notice: null,
    puzzle: null,
    tacticLog: [],
    redo: [],
    hint: null,

    startGame(botId, color) {
      const e = ++epoch
      engines()
      hinted.clear()
      set({
        screen: 'game',
        bot: botById(botId),
        userColor: color,
        plies: [],
        status: 'playing',
        result: null,
        opening: null,
        botThinking: false,
        viewPly: null,
        flag: null,
        notice: null,
        puzzle: null,
        tacticLog: [],
        redo: [],
        hint: null,
      })
      if (color === 'b') void botMove(e)
      else void onUserTurn(e)
    },

    userMove(from, to, promotion = 'q') {
      const { screen, status, botThinking, userColor, plies, puzzle, viewPly } = get()
      if (screen !== 'game' || status !== 'playing' || botThinking) return false
      if (viewPly !== null && viewPly < plies.length - 1) return false
      const chess = new Chess(currentFen(plies))
      if (chess.turn() !== userColor) return false
      const legal = chess.moves({ verbose: true }).find((m) => m.from === from && m.to === to)
      if (!legal) return false
      const uci = `${from}${to}${legal.promotion ? promotion : ''}`

      // Playing the move you took back replays the game as it went; anything else starts fresh.
      const redo = get().redo
      if (redo[redo.length - 1]?.plies[0].uci === uci) {
        get().redoMove()
        return true
      }
      set({ flag: null, notice: null, redo: [] })
      const ply = push(uci, 'user')
      if (!ply) return false
      const index = get().plies.length - 1
      const e = epoch

      if (puzzle) {
        if (get().status === 'playing') set({ puzzle: { ...puzzle, feedback: 'checking' } })
        void puzzleMove(index, puzzle, e)
        return true
      }
      void judgeOpportunity(index, e)
      if (get().status === 'playing') void botMove(e)
      return true
    },

    rewind() {
      const { notice, plies } = get()
      if (notice?.kind !== 'missed') return
      epoch++
      set({ plies: plies.slice(0, notice.ply), status: 'playing', result: null, botThinking: false })
      startPuzzle(notice.tactic)
      void onUserTurn(epoch)
    },

    tryFlag() {
      const { flag } = get()
      if (flag) startPuzzle(flag)
    },

    skipFlag() {
      set({ flag: null })
    },

    dismissNotice() {
      set({ notice: null })
    },

    puzzleHint() {
      const { puzzle } = get()
      // Skip the "name the theme" step when the theme is already on screen.
      if (puzzle) set({ puzzle: { ...puzzle, hint: hiddenMotif(puzzle.tactic) ? (Math.min(2, puzzle.hint + 1) as Puzzle['hint']) : 2 } })
    },

    puzzleReveal() {
      const { puzzle } = get()
      if (puzzle) set({ puzzle: { ...puzzle, reveal: true } })
    },

    takeback() {
      // One move at a time. Stepping back onto the bot's turn pauses the game
      // there instead of letting the bot move again; › replays its original move.
      const { plies, puzzle } = get()
      const i = plies.length - 1
      if (i < 0 || puzzle) return
      const step: RedoStep = { plies: [plies[i]], log: get().tacticLog.filter((t) => t.ply === i) }
      truncate(i)
      set((s) => ({ redo: [...s.redo, step] }))
      if (replay(get().plies).turn() === get().userColor) void onUserTurn(epoch)
    },

    playBest(index) {
      const ply = get().plies[index]
      const best = ply?.rating?.best
      if (!best || ply.by !== 'user' || get().puzzle) return
      truncate(index)
      set({ redo: [] })
      const m = parseUci(best)
      get().userMove(m.from, m.to, m.promotion)
    },

    redoMove() {
      const { redo, puzzle, botThinking, plies } = get()
      const step = redo[redo.length - 1]
      if (!step || puzzle || botThinking || currentFen(plies) !== step.plies[0].fenBefore) return
      // Put back exactly what happened, ratings included; no engine involved.
      epoch++
      const restored = [...plies, ...step.plies]
      let opening = get().opening
      for (const p of step.plies) opening = lookupOpening(p.fenAfter) ?? opening
      set((s) => ({
        plies: restored,
        redo: s.redo.slice(0, -1),
        tacticLog: [...s.tacticLog, ...step.log],
        opening,
        flag: null,
        notice: null,
        hint: null,
        viewPly: null,
      }))
      const chess = replay(restored)
      if (chess.isGameOver()) finish(chess)
      else if (chess.turn() === get().userColor) void onUserTurn(epoch)
      // On the bot's turn, wait for another › if its old reply is next; otherwise it thinks fresh.
      else if (get().redo.length === 0) void botMove(epoch)
    },

    async showHint() {
      const { plies, puzzle, status, botThinking, userColor } = get()
      const fen = currentFen(plies)
      if (puzzle || status !== 'playing' || botThinking || new Chess(fen).turn() !== userColor) return
      hinted.add(fen)
      set({ hint: { fen, move: null }, viewPly: null })
      const analysis = await engines().analyzer.analyze(fen)
      if (currentFen(get().plies) === fen) set({ hint: { fen, move: analysis.lines[0]?.move ?? null } })
    },

    puzzleGiveUp() {
      const { puzzle } = get()
      set({ puzzle: null, notice: puzzle ? { kind: 'idea', tactic: puzzle.tactic } : null })
    },

    resign() {
      if (get().status !== 'playing') return
      finish(replay(get().plies), true)
    },

    setView(ply) {
      set({ viewPly: ply })
    },

    goHome() {
      epoch++
      set({ screen: 'home', botThinking: false })
    },

    showStats() {
      epoch++
      set({ screen: 'stats', botThinking: false })
    },
  }
})
