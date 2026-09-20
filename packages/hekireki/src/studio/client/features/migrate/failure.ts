import { toast } from '@heroui/react'
import { useState } from 'react'

import { useMessages } from './language.js'
import { PAGE } from './messages.js'
import { problemReason } from './problem.js'

/**
 * What went wrong last, with the server's own words for why: a toast is gone before a database
 * error can be read, so the reason stays on the page until it is dismissed or the next try. What
 * failed is kept as which message it is, so switching the language says it again in the other.
 */
export function useFailure() {
  const t = useMessages(PAGE)
  const [failure, setFailure] = useState<{
    readonly what:
      | 'planFailed'
      | 'keepFailed'
      | 'deployFailed'
      | 'recordFailed'
      | 'writeFailed'
      | 'stepFailed'
      | 'baselineFailed'
      | 'rehearseFailed'
      | 'backupFailed'
      | 'restoreFailed'
    readonly step: number | null
    readonly reason: string | null
  } | null>(null)
  return {
    failure,
    setFailure,
    /** Says a request failed and why, on the page and in a toast. */
    fail: (what: NonNullable<typeof failure>['what'], error: unknown) => {
      const reason = problemReason(error)
      setFailure({ what, step: null, reason })
      toast.danger(t[what], reason === null ? undefined : { description: reason })
    },
  }
}
