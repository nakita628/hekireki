import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { ReactNode } from 'react'

import { loadString, saveString } from '../../lib/index.js'

type Direction = 'row' | 'column'

const HANDLE_PX = 6
const KEY_STEP = 0.02

function clamp(ratio: number, min: number, max: number) {
  return Math.min(max, Math.max(min, ratio))
}

function loadRatio(key: string, fallback: number) {
  const stored = Number(loadString(key))
  return Number.isFinite(stored) && stored > 0 && stored < 1 ? stored : fallback
}

/**
 * Two panes with a handle between them that is dragged to change how the space is shared. The
 * share is remembered under `storageKey`; a double click on the handle puts it back to the
 * default, and the arrow keys move it when it has the focus.
 */
export function SplitPane({
  direction,
  storageKey,
  defaultRatio,
  min = 0.15,
  max = 0.85,
  label,
  first,
  second,
}: {
  readonly direction: Direction
  readonly storageKey: string
  readonly defaultRatio: number
  readonly min?: number
  readonly max?: number
  readonly label: string
  readonly first: ReactNode
  readonly second: ReactNode
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const [ratio, setRatio] = useState(() => loadRatio(storageKey, defaultRatio))

  const persist = useCallback(
    (next: number) => {
      const bounded = clamp(next, min, max)
      setRatio(bounded)
      saveString(storageKey, String(bounded))
    },
    [storageKey, min, max],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const element = container.current
      if (element === null || event.button !== 0) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const move = (pointer: PointerEvent) => {
        persist(
          direction === 'row'
            ? (pointer.clientX - rect.left) / rect.width
            : (pointer.clientY - rect.top) / rect.height,
        )
      }
      const stop = () => {
        globalThis.removeEventListener('pointermove', move)
        globalThis.removeEventListener('pointerup', stop)
        globalThis.removeEventListener('pointercancel', stop)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      globalThis.addEventListener('pointermove', move)
      globalThis.addEventListener('pointerup', stop)
      globalThis.addEventListener('pointercancel', stop)
      // The pointer leaves the thin handle at once while dragging; the cursor and the selection
      // are held on the body until it is let go.
      document.body.style.cursor = direction === 'row' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction, persist],
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const smaller = direction === 'row' ? 'ArrowLeft' : 'ArrowUp'
      const larger = direction === 'row' ? 'ArrowRight' : 'ArrowDown'
      if (event.key === smaller) persist(ratio - KEY_STEP)
      else if (event.key === larger) persist(ratio + KEY_STEP)
      else if (event.key === 'Home') persist(min)
      else if (event.key === 'End') persist(max)
      else return
      event.preventDefault()
    },
    [direction, persist, ratio, min, max],
  )

  const template = `minmax(0, ${ratio}fr) ${HANDLE_PX}px minmax(0, ${1 - ratio}fr)`
  return (
    <div
      ref={container}
      className="grid min-h-0 min-w-0 flex-1"
      style={
        direction === 'row' ? { gridTemplateColumns: template } : { gridTemplateRows: template }
      }
    >
      {first}
      <button
        type="button"
        aria-label={label}
        title={`${label} — drag, or use the arrow keys; double-click to reset`}
        className={`m-0 block appearance-none border-0 bg-line p-0 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${
          direction === 'row' ? 'cursor-col-resize' : 'cursor-row-resize'
        }`}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onDoubleClick={() => {
          persist(defaultRatio)
        }}
      />
      {second}
    </div>
  )
}
