import { Chess } from 'chess.js'
import { useEffect, useRef, useState } from 'react'
import { RATING_LABEL } from '../core/analysis/rating'
import { hiddenMotif, parseUci, type Tactic } from '../core/analysis/tactics'
import { currentFen, useGame, type Ply } from '../game/store'
import { Board } from './Board'
import { RATING_COLOR } from './ratingStyle'

const sanOf = (fen: string, uci: string) => {
  try {
    return new Chess(fen).move(parseUci(uci)).san
  } catch {
    return uci
  }
}

export function Game() {
  const g = useGame()
  const { bot, userColor, plies, viewPly, setView, status } = g
  // The result modal reopens for each new result once dismissed.
  const [closedResult, setClosedResult] = useState<typeof g.result>(null)
  // Hold the result screen back so a checkmate gets its moment on the board.
  const [shownResult, setShownResult] = useState<typeof g.result>(null)
  useEffect(() => {
    if (!g.result) return
    const t = setTimeout(() => setShownResult(g.result), g.result.reason === 'checkmate' ? 1800 : 500)
    return () => clearTimeout(t)
  }, [g.result])

  // Arrow keys mirror the ‹ › buttons: take back, or replay your move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGame.getState()
      if (e.key === 'ArrowLeft') s.takeback()
      else if (e.key === 'ArrowRight') s.redoMove()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Stepped back onto the bot's turn: nothing happens until you press › (or go back further).
  const paused = status === 'playing' && !g.botThinking && currentFen(plies).split(' ')[1] !== userColor
  const botName = (
    <div className="player-row">
      <div>
        <span className="who display">{bot.name}</span>
        <span className="sub">{bot.elo}</span>
      </div>
      {g.botThinking && <span className="thinking">thinking</span>}
      {paused && <span className="muted">paused · › to continue</span>}
    </div>
  )
  const youName = (
    <div className="player-row">
      <div>
        <span className="who">You</span>
        <span className="sub">{userColor === 'w' ? 'White' : 'Black'}</span>
      </div>
    </div>
  )

  return (
    <div className="game">
      <div className="board-col">
        {botName}
        <Board />
        {youName}
        <Controls />
      </div>

      <div className="side">
        <div className="row side-top" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost small" onClick={g.goHome}>
            ← Emperors
          </button>
          {status === 'playing' ? (
            <button className="btn small" onClick={g.resign}>
              Resign
            </button>
          ) : (
            <button className="btn small primary" onClick={() => g.startGame(bot.id, userColor)}>
              Rematch
            </button>
          )}
        </div>

        <FlagCard />
        <PuzzleCard />
        <NoticeCard />

        <div className="card">
          <div className="opening">
            {g.opening ? (
              <>
                <span className="eco">{g.opening.eco}</span>
                <b>{g.opening.name}</b>
              </>
            ) : (
              ' '
            )}
          </div>
          <div style={{ height: 10 }} />
          <MoveList plies={plies} viewPly={viewPly} onSelect={setView} />
          <RatingDetail />
        </div>
      </div>

      {status === 'over' && g.result === shownResult && g.result !== closedResult && (
        <ResultModal onClose={() => setClosedResult(g.result)} />
      )}
    </div>
  )
}

/** ‹ takes back your move and the reply, › replays it, Hint shows the best move. */
function Controls() {
  const { plies, puzzle, redo, hint, status, botThinking, userColor, takeback, redoMove, showHint } = useGame()
  const myTurn = status === 'playing' && !botThinking && currentFen(plies).split(' ')[1] === userColor
  const canBack = !puzzle && plies.length > 0
  const canForward = !puzzle && redo.length > 0 && !botThinking
  const canHint = !puzzle && myTurn && !hint
  return (
    <div className="controls">
      <button className="btn icon" onClick={takeback} disabled={!canBack} aria-label="Back a move" title="Back a move (←)">
        ‹
      </button>
      <button className="btn icon" onClick={redoMove} disabled={!canForward} aria-label="Forward a move" title="Forward a move (→)">
        ›
      </button>
      <button className="btn hint-btn" onClick={showHint} disabled={!canHint}>
        {hint && !hint.move ? 'Thinking…' : '💡 Hint'}
      </button>
    </div>
  )
}

function MoveList({ plies, viewPly, onSelect }: { plies: Ply[]; viewPly: number | null; onSelect: (i: number | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (viewPly === null) ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [plies.length, viewPly])
  const rows = []
  for (let i = 0; i < plies.length; i += 2) {
    rows.push(
      <div key={`n${i}`} className="num">
        {i / 2 + 1}.
      </div>,
    )
    for (const j of [i, i + 1]) {
      const p = plies[j]
      rows.push(
        p ? (
          <button
            key={j}
            className={`move ${viewPly === j ? 'active' : ''}`}
            onClick={() => onSelect(viewPly === j ? null : j)}
          >
            {p.san}
            {p.rating && <span className="dot" style={{ background: RATING_COLOR[p.rating.cls] }} />}
          </button>
        ) : (
          <div key={j} />
        ),
      )
    }
  }
  return <div className="moves" ref={ref}>{rows.length ? rows : <span className="muted" style={{ gridColumn: '1 / -1' }}>No moves yet.</span>}</div>
}

/** Subtle line under the move list describing the selected (or latest) move. */
function RatingDetail() {
  const { plies, viewPly, setView, playBest, puzzle } = useGame()
  let index = viewPly
  if (index === null) {
    for (let i = plies.length - 1; i >= 0; i--) if (plies[i].by === 'user') { index = i; break }
  }
  const ply = index !== null ? plies[index] : undefined
  if (!ply || ply.by !== 'user' || !ply.rating) {
    return (
      <div className="rating-detail">
        {viewPly !== null && (
          <button className="btn ghost small" onClick={() => setView(null)}>
            Back to game
          </button>
        )}
      </div>
    )
  }
  const r = ply.rating
  const showBest = r.best && r.best !== ply.uci && r.cls !== 'book'
  return (
    <div className="rating-detail">
      <span className="dot" style={{ background: RATING_COLOR[r.cls] }} />
      <span>
        <b>{ply.san}</b> {RATING_LABEL[r.cls].toLowerCase()}
        {showBest && viewPly !== null && <> · best was <b>{sanOf(ply.fenBefore, r.best!)}</b></>}
      </span>
      {showBest && viewPly === null && (
        <button className="btn ghost small" onClick={() => setView(index)}>
          Show best
        </button>
      )}
      {viewPly !== null && (
        <div className="row" style={{ marginLeft: 'auto' }}>
          {showBest && !puzzle && (
            <button className="btn small primary" onClick={() => playBest(index!)}>
              Play this
            </button>
          )}
          <button className="btn ghost small" onClick={() => setView(null)}>
            Back
          </button>
        </div>
      )}
    </div>
  )
}

function FlagCard() {
  const { flag, tryFlag, skipFlag } = useGame()
  if (!flag) return null
  return (
    <div className="card flag">
      <div className="title">⚔ There’s a forced sequence here</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        Goal: {flag.goal}. Want to freeze the game and find it?
      </div>
      <div className="row">
        <button className="btn primary small" onClick={tryFlag}>
          Try it
        </button>
        <button className="btn ghost small" onClick={skipFlag}>
          Skip
        </button>
      </div>
    </div>
  )
}

function PuzzleCard() {
  const { puzzle, puzzleHint, puzzleReveal, puzzleGiveUp } = useGame()
  if (!puzzle) return null
  const t = puzzle.tactic
  const secret = hiddenMotif(t)
  const fb = {
    wrong: 'Not quite. The position has been reset, try again.',
    correct: 'Correct. Keep going.',
    checking: 'Checking…',
  } as const
  return (
    <div className="card puzzle">
      <div className="title">Frozen: {t.side === 'defense' ? 'find the defense' : 'find the best move'}</div>
      <div className="muted" style={{ marginTop: 4 }}>
        Goal: {t.goal}
        {puzzle.movesLeft < t.userMoves && ` · ${puzzle.movesLeft} to go`}
      </div>
      {puzzle.hint >= 1 && secret && <div className="muted" style={{ marginTop: 4 }}>Hint: {secret}</div>}
      <div className={`fb ${puzzle.feedback ?? ''}`}>{puzzle.feedback ? fb[puzzle.feedback] : ' '}</div>
      <div className="row">
        <button className="btn small" onClick={puzzleHint} disabled={puzzle.hint >= 2}>
          {puzzle.hint === 0 && secret ? 'Hint' : 'Show piece'}
        </button>
        <button className="btn small" onClick={puzzleReveal} disabled={puzzle.reveal}>
          Show move
        </button>
        <button className="btn ghost small" onClick={puzzleGiveUp}>
          Back to game
        </button>
      </div>
    </div>
  )
}

function NoticeCard() {
  const { notice, rewind, dismissNotice } = useGame()
  if (!notice) return null
  const t = notice.tactic
  if (notice.kind === 'missed') {
    return (
      <div className="notice missed">
        <span>
          {t.side === 'defense' ? `You missed a threat. ${t.threat ?? ''}` : `You missed a chance: ${t.label}.`}
        </span>
        <div className="row">
          <button className="btn small" onClick={rewind}>
            Rewind
          </button>
          <button className="x" onClick={dismissNotice} aria-label="Dismiss">
            ×
          </button>
        </div>
      </div>
    )
  }
  const showLine = notice.kind === 'solved' || notice.kind === 'idea'
  const head =
    notice.kind === 'idea'
      ? `The idea: ${t.goal}`
      : notice.kind === 'solved'
        ? `✓ Solved: ${t.goal}`
        : t.side === 'defense'
          ? `✓ Threat handled: ${t.goal.toLowerCase()}`
          : `✓ Found it: ${t.label}`
  return (
    <div className={`notice ${notice.kind === 'idea' ? '' : 'found'}`}>
      <span>
        {head}
        {showLine && <span className="line">{lineSan(t)}</span>}
      </span>
      <button className="x" onClick={dismissNotice} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}

/** The engine's line through your last move of the tactic and the reply to it. */
function lineSan(t: Tactic): string {
  const chess = new Chess(t.fen)
  const out: string[] = []
  for (const uci of t.line.slice(0, t.userMoves * 2)) {
    const num = chess.moveNumber()
    const white = chess.turn() === 'w'
    try {
      const san = chess.move(parseUci(uci)).san
      out.push(white ? `${num}. ${san}` : out.length === 0 ? `${num}… ${san}` : san)
    } catch {
      break
    }
  }
  return out.join(' ')
}

function ResultModal({ onClose }: { onClose: () => void }) {
  const { result, plies, tacticLog, bot, userColor, startGame, goHome } = useGame()
  if (!result) return null
  const rated = plies.filter((p) => p.by === 'user' && p.rating)
  const accuracy = rated.length ? Math.round(rated.reduce((s, p) => s + p.rating!.accuracy, 0) / rated.length) : null
  const found = tacticLog.filter((t) => t.found).length
  const title = result.winner === 'user' ? 'Victory' : result.winner === 'bot' ? 'Defeat' : 'Draw'
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="display">{title}</h2>
        <div className="muted">
          {result.winner === 'draw' ? 'Draw' : result.winner === 'user' ? `You beat ${bot.name}` : `${bot.name} wins`} by {result.reason}
        </div>
        <div className="stats">
          <div className="stat">
            <b>{accuracy ?? '–'}</b>
            <span>accuracy</span>
          </div>
          <div className="stat">
            <b>
              {found}/{tacticLog.length}
            </b>
            <span>tactics found</span>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => startGame(bot.id, userColor)}>
            Rematch
          </button>
          <button className="btn" onClick={() => { onClose(); useGame.getState().takeback() }}>
            ‹ Take back
          </button>
          <button className="btn" onClick={onClose}>
            Review
          </button>
          <button className="btn ghost" onClick={goHome}>
            Emperors
          </button>
        </div>
      </div>
    </div>
  )
}
