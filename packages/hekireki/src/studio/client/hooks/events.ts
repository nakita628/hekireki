import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useUiStore } from '../lib/index.js'
import { getDbCountsQueryKey, getDocsQueryKey, getSchemaQueryKey } from './index.js'

// The one subscription in the app: the server announces schema changes over SSE and the
// affected queries are refetched. Everything else is a plain query or mutation.
export function useStudioEvents() {
  const queryClient = useQueryClient()
  const setConnection = useUiStore((s) => s.setConnection)
  useEffect(() => {
    const events = new EventSource('/api/schema/events')
    events.addEventListener('ready', () => {
      setConnection('live')
    })
    events.addEventListener('change', () => {
      void queryClient.invalidateQueries({ queryKey: getSchemaQueryKey() })
      void queryClient.invalidateQueries({ queryKey: getDbCountsQueryKey() })
      void queryClient.invalidateQueries({ queryKey: getDocsQueryKey() })
    })
    events.addEventListener('error', () => {
      setConnection('offline')
    })
    return () => {
      events.close()
    }
  }, [queryClient, setConnection])
}
