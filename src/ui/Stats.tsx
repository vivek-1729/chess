import { useMemo } from 'react'
import { EMPERORS } from '../core/bots/emperors'
import { useGame } from '../game/store'
import { loadGames } from '../storage/storage'

const THEME_NAME: Record<string, string> = {
  mate: 'Checkmates',
  fork: 'Forks',
  pin: 'Pins',
  skewer: 'Skewers',
  discovered: 'Discovered attacks',
  hanging: 'Free pieces',
  tactic: 'Winning material',
  defense: 'Threats defended',
}

export function Stats() {
  const goHome = useGame((s) => s.goHome)
  const games = useMemo(() => loadGames(), [])

  const wins = games.filter((g) => g.result === 'win').length
  const accs = games.map((g) => g.accuracy).filter((a): a is number => a !== null)
  const avgAcc = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null

  const themes = new Map<string, { found: number; total: number }>()
  for (const g of games)
    for (const t of g.tactics) {
      const e = themes.get(t.theme) ?? { found: 0, total: 0 }
      e.total++
      if (t.found) e.found++
      themes.set(t.theme, e)
    }
  const allTactics = [...themes.values()].reduce((s, e) => ({ found: s.found + e.found, total: s.total + e.total }), { found: 0, total: 0 })

  return (
    <div className="stats-page">
      <button className="btn ghost small" onClick={goHome} style={{ marginBottom: 20 }}>
        ← Emperors
      </button>
      <h1 className="display">Your record</h1>

      <div className="stat-grid">
        <div className="card">
          <b>{games.length}</b>
          <span>games played</span>
        </div>
        <div className="card">
          <b>{games.length ? Math.round((wins / games.length) * 100) : 0}%</b>
          <span>win rate</span>
        </div>
        <div className="card">
          <b>{avgAcc ?? '–'}</b>
          <span>average accuracy</span>
        </div>
        <div className="card">
          <b>{allTactics.total ? Math.round((allTactics.found / allTactics.total) * 100) : 0}%</b>
          <span>tactics spotted</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Tactics by type</h3>
        {themes.size === 0 ? (
          <p className="muted">Play a few games and this fills in.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Type</th><th>Spotted</th><th></th></tr>
            </thead>
            <tbody>
              {[...themes.entries()]
                .sort((a, b) => a[1].found / a[1].total - b[1].found / b[1].total)
                .map(([theme, e]) => (
                  <tr key={theme}>
                    <td>{THEME_NAME[theme] ?? theme}</td>
                    <td>{e.found}/{e.total}</td>
                    <td style={{ width: '40%' }}>
                      <div className="bar"><div style={{ width: `${(e.found / e.total) * 100}%` }} /></div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent games</h3>
        {games.length === 0 ? (
          <p className="muted">No games yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Opponent</th><th>Result</th><th>Accuracy</th><th>Opening</th></tr>
            </thead>
            <tbody>
              {games.slice(0, 30).map((g) => (
                <tr key={g.id}>
                  <td>{new Date(g.date).toLocaleDateString()}</td>
                  <td>{EMPERORS.find((b) => b.id === g.botId)?.name ?? g.botId}</td>
                  <td style={{ color: g.result === 'win' ? 'var(--good)' : g.result === 'loss' ? 'var(--bad)' : undefined }}>
                    {g.result} <span className="muted">by {g.reason}</span>
                  </td>
                  <td>{g.accuracy !== null ? Math.round(g.accuracy) : '–'}</td>
                  <td className="muted">{g.opening ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
