import { createContext, useContext } from 'react'
import type { CanvasMode } from './types'

export const CanvasModeContext = createContext<CanvasMode>('view')

export function useCanvasMode() {
  return useContext(CanvasModeContext)
}
