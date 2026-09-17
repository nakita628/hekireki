import { useEffect, useState } from 'react'

/**
 * A value that only shows after it has held for `delayMs`, and hides at once: an error that
 * appears while a line is half-typed does not flash, and a fix shows immediately.
 *
 * `key` is what "held" means. Without one the value is its own key, which is right for a
 * primitive; an object needs one, because a value that arrives again as a new object is still
 * the same value. The schema snapshot is rebuilt on every save, and comparing the objects would
 * hide an error that has not gone away and show it again `delayMs` later — a blink for every
 * keystroke that reaches disk.
 */
export function useSteady<T>(value: T | null, delayMs: number, key?: string) {
  const mark = value === null ? null : (key ?? String(value))
  const [steady, setSteady] = useState<string | null>(null)
  useEffect(() => {
    if (mark === null) return undefined
    const timer = setTimeout(() => {
      setSteady(mark)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [mark, delayMs])
  // The value itself, not the one the timer closed over: the same key means the same value.
  return mark !== null && steady === mark ? value : null
}
