// Local-only persistence. Everything goes through this module so the phone
// app can swap localStorage for AsyncStorage without touching callers.
import type { TacticTheme } from '../core/analysis/tactics'

export type GameRecord = {
  id: string
  date: string
  botId: string
  userColor: 'w' | 'b'
  result: 'win' | 'loss' | 'draw'
  reason: string
  pgn: string
  accuracy: number | null
  opening: string | null
  tactics: { theme: TacticTheme; label: string; found: boolean; ply?: number }[]
}

const GAMES_KEY = 'imperium.games.v1'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable; progress just won't persist this time.
  }
}

export function loadGames(): GameRecord[] {
  return read<GameRecord[]>(GAMES_KEY, [])
}

export function saveGame(record: GameRecord) {
  write(GAMES_KEY, [record, ...loadGames()])
}
