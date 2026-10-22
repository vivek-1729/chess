// Converts the Lichess chess-openings TSVs (CC0) into a position -> name lookup.
// Keyed by the first four FEN fields so transpositions resolve to the same name.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { Chess } from 'chess.js'

const out = {}
for (const file of readdirSync('data').filter((f) => f.endsWith('.tsv')).sort()) {
  const rows = readFileSync(`data/${file}`, 'utf8').trim().split('\n').slice(1)
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t')
    const chess = new Chess()
    chess.loadPgn(pgn)
    const key = chess.fen().split(' ').slice(0, 4).join(' ')
    // Prefer the shorter (more general) name when two lines share a position.
    if (!out[key] || name.length < out[key][1].length) out[key] = [eco, name]
  }
}
writeFileSync('src/core/openings/openings.json', JSON.stringify(out))
console.log(`${Object.keys(out).length} positions`)
