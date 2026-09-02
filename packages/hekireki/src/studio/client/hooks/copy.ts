import { useCallback, useState } from 'react'

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
