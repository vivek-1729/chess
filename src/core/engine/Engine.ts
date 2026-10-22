// Thin UCI wrapper around a Stockfish web worker. Jobs run one at a time in
// the order they were requested.

export type Score = { cp: number; mate?: undefined } | { mate: number; cp?: undefined }

export type EngineLine = {
  multipv: number
  depth: number
  /** Score from the side to move's point of view. */
  score: Score
  pv: string[]
}

export type SearchResult = {
  bestmove: string | null
  lines: EngineLine[]
}

export type SearchOptions = {
  depth?: number
  movetime?: number
  multipv?: number
}

export interface EngineWorker {
  postMessage(msg: string): void
  onmessage: ((ev: { data: unknown }) => void) | null
  terminate(): void
}

const ENGINE_URL = '/engine/stockfish-19-lite-single.js'

export class Engine {
  private worker: EngineWorker
  private listeners = new Set<(line: string) => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private ready: Promise<void>
  private multipv = 1

  constructor(worker: EngineWorker = new Worker(ENGINE_URL) as unknown as EngineWorker) {
    this.worker = worker
    this.worker.onmessage = (ev) => {
      const text = String(ev.data)
      for (const line of text.split('\n')) for (const l of this.listeners) l(line)
    }
    this.ready = (async () => {
      await this.send('uci', (l) => l === 'uciok')
      await this.send('isready', (l) => l === 'readyok')
    })()
  }

  private send(cmd: string, until: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      const listener = (line: string) => {
        if (until(line)) {
          this.listeners.delete(listener)
          resolve()
        }
      }
      this.listeners.add(listener)
      this.worker.postMessage(cmd)
    })
  }

  /** Searches `fen` and resolves with the final line for each multipv slot. */
  search(fen: string, opts: SearchOptions): Promise<SearchResult> {
    const job = this.queue.then(() => this.runSearch(fen, opts))
    this.queue = job.catch(() => undefined)
    return job
  }

  private async runSearch(fen: string, opts: SearchOptions): Promise<SearchResult> {
    await this.ready
    const multipv = opts.multipv ?? 1
    if (multipv !== this.multipv) {
      this.worker.postMessage(`setoption name MultiPV value ${multipv}`)
      this.multipv = multipv
    }
    this.worker.postMessage(`position fen ${fen}`)

    const lines = new Map<number, EngineLine>()
    let bestmove: string | null = null
    const limits = [
      opts.depth ? `depth ${opts.depth}` : '',
      opts.movetime ? `movetime ${opts.movetime}` : '',
    ].join(' ')

    await this.send(`go ${limits}`.trim(), (line) => {
      if (line.startsWith('info') && line.includes(' pv ')) {
        const parsed = parseInfo(line)
        if (parsed) lines.set(parsed.multipv, parsed)
      } else if (line.startsWith('bestmove')) {
        const m = line.split(' ')[1]
        bestmove = m && m !== '(none)' ? m : null
        return true
      }
      return false
    })

    return {
      bestmove,
      lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv),
    }
  }

  terminate() {
    this.worker.terminate()
  }
}

function parseInfo(line: string): EngineLine | null {
  // Bound scores are provisional; wait for the exact one.
  if (line.includes('lowerbound') || line.includes('upperbound')) return null
  const tokens = line.split(' ')
  const get = (key: string) => {
    const i = tokens.indexOf(key)
    return i >= 0 ? tokens[i + 1] : undefined
  }
  const scoreIdx = tokens.indexOf('score')
  if (scoreIdx < 0) return null
  const kind = tokens[scoreIdx + 1]
  const value = Number(tokens[scoreIdx + 2])
  const pvIdx = tokens.indexOf('pv')
  return {
    multipv: Number(get('multipv') ?? 1),
    depth: Number(get('depth') ?? 0),
    score: kind === 'mate' ? { mate: value } : { cp: value },
    pv: tokens.slice(pvIdx + 1).filter(Boolean),
  }
}
