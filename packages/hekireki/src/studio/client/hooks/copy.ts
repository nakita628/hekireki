import { toast } from '@heroui/react'
import { useCallback, useState } from 'react'

/**
 * Writes text to the clipboard and says so. The clipboard gives no feedback of its own, and a
 * button that looks like it did nothing is a button people press twice — every copy in Studio
 * ends in a toast naming what was taken.
 */
export function copyText(text: string, what: string) {
  const write = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`)
    } catch {
      toast.danger(`${what} could not be copied — the browser refused the clipboard.`)
    }
  }
  void write()
}

/** Copies text to the clipboard and reports "copied" for a moment. */
export function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text: string) => {
    const write = async () => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => {
          setCopied(false)
        }, 1500)
      } catch {
        setCopied(false)
      }
    }
    void write()
  }, [])
  return { copied, copy }
}
