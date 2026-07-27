import { useState, useEffect, useCallback } from 'react'
import { PIECE_STYLES, DEFAULT_PIECE_STYLE_ID, getPieceStyle } from '../utils/pieceStyles'

const STORAGE_KEY = 'chessbook_piece_style'
const CHANGE_EVENT = 'chessbook:piece-style-changed'

// Shared, localStorage-backed piece style selection. Multiple <Board> and
// picker components stay in sync via a custom window event (no context
// provider needed since the value only needs to reach a couple of screens).
export function usePieceStyle() {
  const [id, setId] = useState(() => localStorage.getItem(STORAGE_KEY) || DEFAULT_PIECE_STYLE_ID)

  useEffect(() => {
    const onChange = () => setId(localStorage.getItem(STORAGE_KEY) || DEFAULT_PIECE_STYLE_ID)
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])

  const setStyle = useCallback((newId) => {
    localStorage.setItem(STORAGE_KEY, newId)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return [getPieceStyle(id), setStyle, PIECE_STYLES]
}
