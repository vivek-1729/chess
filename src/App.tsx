import { useGame } from './game/store'
import { Game } from './ui/Game'
import { Home } from './ui/Home'
import { Stats } from './ui/Stats'

export default function App() {
  const screen = useGame((s) => s.screen)
  if (screen === 'game') return <Game />
  if (screen === 'stats') return <Stats />
  return <Home />
}
