import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useUiStore } from '../lib/index.js'
import {
  getDbCountsQueryKey,
  getDocsQueryKey,
  getMigrateBaselineQueryKey,
  getMigrateQueryKey,
  getSchemaQueryKey,
} from './index.js'

// The one subscription in the app: the server announces schema changes, and changes to the
// migrations directory, over SSE and the affected queries are refetched. Everything else is a plain
// query or mutation.
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
      // Whether the database is in step with the schema is a question of the schema too.
      void queryClient.invalidateQueries({ queryKey: getMigrateQueryKey() })
    })
    events.addEventListener('migrations', () => {
      void queryClient.invalidateQueries({ queryKey: getMigrateQueryKey() })
      void queryClient.invalidateQueries({ queryKey: getMigrateBaselineQueryKey() })
    })
    events.addEventListener('error', () => {
      setConnection('offline')
    })
    return () => {
      events.close()
    }
  }, [queryClient, setConnection])
}
