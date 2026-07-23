import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useStockfish — wraps a Stockfish WebWorker.
 *
 * Returns { eval: string, line: string, ready: boolean, analyse }
 * Call analyse(moveList) to trigger evaluation of a position.
 *
 * Uses Stockfish 16 via CDN. For production, copy stockfish.js into /public
 * and change the Worker path to '/stockfish.js' (no network dependency).
 */
export function useStockfish() {
  const workerRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [evalStr, setEvalStr] = useState('+0.0')
  const [line, setLine] = useState('—')
  const [pct, setPct] = useState(50)

  useEffect(() => {
    let worker
    try {
      worker = new Worker('https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish.js')
      workerRef.current = worker
      worker.onmessage = e => {
        const msg = e.data
        if (msg.includes('readyok')) { setReady(true); return }
        if (msg.startsWith('info depth') && msg.includes('score cp')) {
          const m = msg.match(/score cp (-?\d+)/)
          const pv = msg.match(/pv (.+)/)
          if (m) {
            const cp = parseInt(m[1])
            const display = (cp > 0 ? '+' : '') + (cp / 100).toFixed(1)
            setEvalStr(display)
            setPct(Math.min(Math.max(50 + cp / 20, 5), 95))
            if (pv) setLine(pv[1].split(' ').slice(0, 6).join(' '))
          }
        }
      }
      worker.postMessage('uci')
      worker.postMessage('isready')
    } catch (err) {
      console.warn('Stockfish unavailable:', err)
    }
    return () => worker?.terminate()
  }, [])

  const analyse = useCallback((moves = [], moveTime = 600) => {
    if (!workerRef.current || !ready) return
    const mvStr = moves.join(' ')
    workerRef.current.postMessage('stop')
    workerRef.current.postMessage('position startpos' + (mvStr ? ' moves ' + mvStr : ''))
    workerRef.current.postMessage(`go movetime ${moveTime}`)
  }, [ready])

  return { eval: evalStr, line, pct, ready, analyse }
}
