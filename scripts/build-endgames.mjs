// One-off data-prep script: downloads the (CC0-licensed) Lichess puzzle
// database, streams + decompresses it on the fly, filters for endgame-themed
// puzzles, converts each into the same shape as frontend/public/polgar.json
// (fen = position the SOLVER starts from, moves = solver's line only — the
// Lichess CSV's first move is the opponent's "blunder" setup move, which we
// apply with chess.js to compute the solver's starting FEN), and writes the
// result to frontend/public/endgames.json.
//
// Not part of the app's runtime — run manually with:
//   node scripts/build-endgames.mjs
import { createWriteStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { Readable, Transform } from 'node:stream'
import zlib from 'node:zlib'
import { Chess } from '../frontend/node_modules/chess.js/dist/esm/chess.js'

const SOURCE_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'
const OUT_PATH   = new URL('../frontend/public/endgames.json', import.meta.url)

// More specific themes are checked first so a puzzle tagged with both
// "endgame" and "rookEndgame" lands in the specific bucket, not the
// catch-all one.
const BUCKETS = [
  { key: 'pawnEndgame',      title: 'Pawn Endgames' },
  { key: 'rookEndgame',      title: 'Rook Endgames' },
  { key: 'bishopEndgame',    title: 'Bishop Endgames' },
  { key: 'knightEndgame',    title: 'Knight Endgames' },
  { key: 'queenEndgame',     title: 'Queen Endgames' },
  { key: 'queenRookEndgame', title: 'Queen & Rook Endgames' },
  { key: 'endgame',          title: 'General Endgames' },
]
const PER_BUCKET_TARGET = 150
const MAX_PLY           = 10   // skip unusually long solution lines
const MIN_RATING        = 900
const MAX_RATING        = 2200
const MAX_ROWS_SCANNED  = 3_000_000 // safety cap so the script can't run forever

function labelFor(themeKey) {
  return BUCKETS.find(b => b.key === themeKey).title.replace(/s$/, '')
}

async function main() {
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)

  // The Lichess dump is written in zstd's "seekable" format, which prefixes
  // the real compressed frame with a skippable frame (magic 0x184D2A50-5F)
  // that Node's zstd decompressor chokes on ("Unknown frame descriptor") —
  // strip it off manually before handing bytes to the decompressor.
  let strippedHeader = false
  let headerBuf = Buffer.alloc(0)
  const stripSkippableFrame = new Transform({
    transform(chunk, _enc, cb) {
      if (strippedHeader) { this.push(chunk); return cb() }
      headerBuf = Buffer.concat([headerBuf, chunk])
      if (headerBuf.length < 8) return cb()
      const magic = headerBuf.readUInt32LE(0)
      if (magic >= 0x184d2a50 && magic <= 0x184d2a5f) {
        const frameSize = headerBuf.readUInt32LE(4)
        const total = 8 + frameSize
        if (headerBuf.length < total) return cb()
        strippedHeader = true
        this.push(headerBuf.subarray(total))
      } else {
        strippedHeader = true
        this.push(headerBuf)
      }
      headerBuf = null
      cb()
    },
  })

  const decompress = zlib.createZstdDecompress()
  // Early-abort (once we have enough puzzles) intentionally breaks the pipe —
  // don't let that crash the process.
  decompress.on('error', () => {})
  Readable.fromWeb(res.body).pipe(stripSkippableFrame).pipe(decompress)
  const rl = createInterface({ input: decompress, crlfDelay: Infinity })

  const buckets = Object.fromEntries(BUCKETS.map(b => [b.key, []]))
  const seenIds = new Set()
  let header = null
  let rowsScanned = 0

  const isFull = () => BUCKETS.every(b => buckets[b.key].length >= PER_BUCKET_TARGET)

  for await (const line of rl) {
    if (!header) { header = line.split(','); continue }
    rowsScanned++
    if (rowsScanned > MAX_ROWS_SCANNED || isFull()) { rl.close(); decompress.destroy(); break }

    // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
    const cols = line.split(',')
    const [id, fen, movesStr, ratingStr, , , , themesStr] = cols
    if (!id || seenIds.has(id)) continue

    const rating = Number(ratingStr)
    if (!Number.isFinite(rating) || rating < MIN_RATING || rating > MAX_RATING) continue

    const themes = (themesStr || '').split(' ').filter(Boolean)
    const bucketKey = BUCKETS.find(b => themes.includes(b.key))?.key
    if (!bucketKey || buckets[bucketKey].length >= PER_BUCKET_TARGET) continue

    const uciMoves = movesStr.split(' ').filter(Boolean)
    if (uciMoves.length < 2 || uciMoves.length > MAX_PLY + 1) continue

    // Apply the opponent's setup move (moves[0]) to get the FEN the solver
    // actually starts from, matching polgar.json's convention.
    let chess
    try {
      chess = new Chess(fen)
      const setup = uciMoves[0]
      const ok = chess.move({
        from: setup.slice(0, 2),
        to: setup.slice(2, 4),
        promotion: setup.length > 4 ? setup.slice(4) : undefined,
      })
      if (!ok) continue
    } catch {
      continue
    }

    const solverFen   = chess.fen()
    const solverMoves = uciMoves.slice(1)
    const sideToMove  = solverFen.split(' ')[1] === 'w' ? 'White to Move' : 'Black to Move'

    seenIds.add(id)
    buckets[bucketKey].push({
      puzzle_id: id,
      fen: solverFen,
      moves: [solverMoves],
      first: sideToMove,
      type: `${labelFor(bucketKey)} · rating ${rating}`,
    })
  }

  const chapters = BUCKETS
    .map(b => ({ title: b.title, puzzles: buckets[b.key] }))
    .filter(c => c.puzzles.length > 0)

  const total = chapters.reduce((n, c) => n + c.puzzles.length, 0)
  console.log(`Scanned ${rowsScanned} rows, collected ${total} endgame puzzles across ${chapters.length} chapters.`)
  for (const c of chapters) console.log(`  ${c.title}: ${c.puzzles.length}`)

  const out = { id: 'lichess-endgames', name: 'Lichess Endgame Puzzles', chapters }
  await writeFile(OUT_PATH, JSON.stringify(out))
  console.log(`Wrote ${OUT_PATH.pathname}`)
}

main().catch(err => { console.error(err); process.exit(1) })
