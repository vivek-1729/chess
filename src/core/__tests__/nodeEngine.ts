import { createRequire } from 'node:module'
import { Engine, type EngineWorker } from '../engine/Engine'

const require = createRequire(import.meta.url)

/** Runs the same Stockfish build the browser uses, inside Node. */
export function nodeEngine(): Engine {
  const adapter: EngineWorker = {
    onmessage: null,
    postMessage: (cmd) => sf.processCommand(cmd),
    terminate: () => sf.terminate?.(),
  }
  const sf = require('stockfish')('lite-single', (line: string) => adapter.onmessage?.({ data: line }))
  return new Engine(adapter)
}
