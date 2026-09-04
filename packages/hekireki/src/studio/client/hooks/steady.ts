import { useEffect, useState } from 'react'

/**
 * A value that only shows after it has held for `delayMs`, and hides at once: an error that
 * appears while a line is half-typed does not flash, and a fix shows immediately.
 */
export function useSteady<T>(value: T | null, delayMs: number): T | null {
  const [steady, setSteady] = useState<T | null>(null)
  useEffect(() => {
    if (value === null) return undefined
    const timer = setTimeout(() => {
      setSteady(value)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])
  // A value that changed since the timer last fired is not steady yet.
  return value !== null && steady === value ? steady : null
}
