import { useMemo, useState } from 'react'
import { EMPERORS } from '../core/bots/emperors'
import { useGame, type Color } from '../game/store'
import { loadGames } from '../storage/storage'

const TIERS = [
  { label: 'The worst of Rome', from: 0, to: 4 },
  { label: 'Middling reigns', from: 4, to: 9 },
  { label: 'The good emperors', from: 9, to: 14 },
]

export function Home() {
  const startGame = useGame((s) => s.startGame)
  const showStats = useGame((s) => s.showStats)
  const lastBot = useGame((s) => s.bot.id)
  const [botId, setBotId] = useState(lastBot)
  const [color, setColor] = useState<Color | 'random'>('w')

  const records = useMemo(() => {
    const out: Record<string, { w: number; l: number; d: number }> = {}
    for (const g of loadGames()) {
      const r = (out[g.botId] ??= { w: 0, l: 0, d: 0 })
      if (g.result === 'win') r.w++
      else if (g.result === 'loss') r.l++
      else r.d++
    }
    return out
  }, [])

  const bot = EMPERORS.find((b) => b.id === botId)!
  const begin = () => startGame(botId, color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color)

  return (
    <div className="home">
      <header>
        <div>
          <h1 className="display">Imperium</h1>
          <p className="tagline">Challenge the emperors. Spot the tactics they leave behind.</p>
        </div>
        <button className="btn ghost" onClick={showStats}>
          Your record
        </button>
      </header>

      <h2>Choose your opponent</h2>
      {TIERS.map((tier) => (
        <div className="tier" key={tier.label}>
          <div className="tier-label">{tier.label}</div>
          <div className="emperors">
            {EMPERORS.slice(tier.from, tier.to).map((b) => {
              const r = records[b.id]
              return (
                <button
                  key={b.id}
                  className={`emperor ${b.id === botId ? 'selected' : ''}`}
                  onClick={() => setBotId(b.id)}
                  onDoubleClick={() => startGame(b.id, color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color)}
                >
                  <div className="top">
                    <span className="name display">{b.name}</span>
                    <span className="elo">{b.elo}</span>
                  </div>
                  <div className="reign">
                    {b.reign} · {b.style}
                  </div>
                  <div className="bio">{b.bio}</div>
                  {r && (
                    <div className="record">
                      {r.w}W · {r.l}L · {r.d}D
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div className="start-bar">
        <div>
          <span className="display" style={{ fontWeight: 700 }}>
            {bot.name}
          </span>{' '}
          <span className="muted">· {bot.elo}</span>
        </div>
        <div className="row">
          <div className="seg">
            {(['w', 'random', 'b'] as const).map((c) => (
              <button key={c} className={color === c ? 'on' : ''} onClick={() => setColor(c)}>
                {c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}
              </button>
            ))}
          </div>
          <button className="btn primary" onClick={begin}>
            Play
          </button>
        </div>
      </div>
    </div>
  )
}
