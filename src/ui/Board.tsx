import { Chess, type Square } from 'chess.js'
import { useMemo, useState, type CSSProperties } from 'react'
import { Chessboard, type Arrow } from 'react-chessboard'
import { parseUci } from '../core/analysis/tactics'
import { currentFen, useGame } from '../game/store'
import { RATING_COLOR, RATING_SYMBOL } from './ratingStyle'

const LAST_MOVE = 'rgba(212, 169, 79, 0.38)'
const SELECTED = 'rgba(212, 169, 79, 0.6)'
const TARGET_DOT = 'radial-gradient(circle, rgba(20,20,20,0.28) 22%, transparent 24%)'
const TARGET_RING = 'radial-gradient(circle, transparent 58%, rgba(20,20,20,0.28) 60%)'
const CHECK = 'radial-gradient(circle, rgba(229,83,61,0.85) 0%, rgba(229,83,61,0.35) 45%, transparent 70%)'
const HINT = 'rgba(110, 168, 216, 0.55)'

export function Board() {
  const { plies, viewPly, userColor, status, botThinking, puzzle, hint, result, userMove } = useGame()
  const [selected, setSelected] = useState<Square | null>(null)

  const live = viewPly === null || viewPly === plies.length - 1
  const shownPly = viewPly !== null ? plies[viewPly] : plies[plies.length - 1]
  const fen = viewPly !== null ? plies[viewPly].fenAfter : currentFen(plies)
  const chess = useMemo(() => new Chess(fen), [fen])
  const myTurn = live && status === 'playing' && !botThinking && chess.turn() === userColor

  const targets = useMemo(() => {
    if (!selected || !myTurn) return []
    return chess.moves({ square: selected, verbose: true }).map((m) => m.to)
  }, [selected, myTurn, chess])

  // Which rated move to badge: the inspected one, or your latest while live.
  const ratedPly = useMemo(() => {
    if (viewPly !== null) return plies[viewPly]?.by === 'user' ? plies[viewPly] : undefined
    for (let i = plies.length - 1; i >= 0; i--) {
      if (plies[i].by === 'user') {
        const touched = plies.slice(i + 1).some((p) => p.to === plies[i].to)
        return touched ? undefined : plies[i]
      }
    }
    return undefined
  }, [plies, viewPly])

  const styles: Record<string, CSSProperties> = {}
  if (shownPly) {
    styles[shownPly.from] = { background: LAST_MOVE }
    styles[shownPly.to] = { background: LAST_MOVE }
  }
  if (chess.inCheck()) {
    const king = chess.board().flat().find((p) => p && p.type === 'k' && p.color === chess.turn())
    if (king) styles[king.square] = { background: CHECK }
  }
  if (puzzle && live && puzzle.hint >= 2 && puzzle.bestNow) {
    styles[parseUci(puzzle.bestNow).from] = { background: HINT }
  }
  if (selected) styles[selected] = { background: SELECTED }
  for (const t of targets) {
    styles[t] = { ...styles[t], backgroundImage: chess.get(t) ? TARGET_RING : TARGET_DOT }
  }

  const arrows: Arrow[] = []
  if (viewPly !== null && ratedPly?.rating?.best && ratedPly.rating.best !== ratedPly.uci) {
    const b = parseUci(ratedPly.rating.best)
    arrows.push({ startSquare: b.from, endSquare: b.to, color: 'rgba(129, 182, 76, 0.85)' })
  }
  if (hint?.move && live && hint.fen === fen) {
    const h = parseUci(hint.move)
    arrows.push({ startSquare: h.from, endSquare: h.to, color: 'rgba(212, 169, 79, 0.9)' })
  }
  if (puzzle && live && puzzle.reveal && puzzle.bestNow) {
    const b = parseUci(puzzle.bestNow)
    arrows.push({ startSquare: b.from, endSquare: b.to, color: 'rgba(110, 168, 216, 0.9)' })
  }

  const tryMove = (from: Square, to: Square) => {
    setSelected(null)
    return userMove(from, to)
  }

  const onSquareClick = ({ square }: { square: string }) => {
    const sq = square as Square
    if (selected && targets.includes(sq)) {
      tryMove(selected, sq)
      return
    }
    const piece = chess.get(sq)
    setSelected(myTurn && piece && piece.color === userColor && sq !== selected ? sq : null)
  }

  const mated = live && status === 'over' && result?.reason === 'checkmate' && chess.isCheckmate()
  const matedKing = mated ? chess.board().flat().find((p) => p && p.type === 'k' && p.color === chess.turn())?.square : undefined

  const badge = ratedPly?.rating
  return (
    <div className={`board-wrap ${puzzle ? 'frozen' : ''} ${mated ? 'checkmate' : ''}`}>
      {mated && (
        <div className={`mate-banner ${result?.winner === 'user' ? 'won' : 'lost'}`}>
          <span className="display">Checkmate</span>
        </div>
      )}
      <Chessboard
        options={{
          id: 'imperium',
          position: fen,
          boardOrientation: userColor === 'w' ? 'white' : 'black',
          animationDurationInMs: 160,
          allowDrawingArrows: true,
          arrows,
          lightSquareStyle: { backgroundColor: '#e9dcc2' },
          darkSquareStyle: { backgroundColor: '#a98a64' },
          canDragPiece: ({ piece }) => myTurn && piece.pieceType[0] === userColor,
          onPieceDrag: ({ square }) => square && setSelected(square as Square),
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            !!targetSquare && tryMove(sourceSquare as Square, targetSquare as Square),
          onSquareClick,
          squareRenderer: ({ square, children }) => (
            <div
              className={square === matedKing ? 'mated' : undefined}
              style={{ width: '100%', height: '100%', position: 'relative', ...styles[square] }}
            >
              {children}
              {badge && ratedPly?.to === square && (
                <span
                  className="badge"
                  title={badge.cls}
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    minWidth: 17,
                    height: 17,
                    padding: '0 3px',
                    borderRadius: 9,
                    background: RATING_COLOR[badge.cls],
                    color: '#14110c',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'grid',
                    placeItems: 'center',
                    opacity: 0.9,
                    pointerEvents: 'none',
                    zIndex: 5,
                  }}
                >
                  {RATING_SYMBOL[badge.cls]}
                </span>
              )}
            </div>
          ),
        }}
      />
    </div>
  )
}
