import { useEffect, useState } from 'react'

/**
 * The value as it stood once it stopped changing for `delayMs`. A search box is bound to the
 * typed value so it stays responsive, and the query that costs a round trip is bound to this:
 * one read per pause instead of one per keystroke.
 */
export function useDebounced<T>(value: T, delayMs: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])
  return settled
}
