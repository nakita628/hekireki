import { Button } from '@heroui/react'
import { useMutation } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'
import type { InferResponseType } from 'hono/client'
import { useState } from 'react'
import { LuEye, LuTableProperties } from 'react-icons/lu'

import { ResultTable } from '../../components/result-table.js'
import { client } from '../../lib/index.js'
import { useMessages } from './language.js'
import { PREVIEWS } from './messages.js'

type Plan = InferResponseType<typeof client.migrate.plan.$post, 200>

/**
 * One model as the fixes will leave it. The query is the one the check counted by, with the
 * fixes written into it as CTEs: it reads the rows there are now and shows what they become,
 * so the result can be looked at before a single statement has run.
 */
function Preview({ preview }: { readonly preview: Plan['previews'][number] }) {
  const t = useMessages(PREVIEWS)
  const [open, setOpen] = useState(false)
  const rows = useMutation({
    mutationFn: () => parseResponse(client.db.sql.$post({ json: { sql: preview.sql } })),
  })
  return (
    <li className="rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <LuTableProperties className="text-muted" size={16} />
        <span className="font-mono font-semibold">{preview.modelName}</span>
        <Button
          className="ml-auto"
          size="sm"
          variant="ghost"
          isDisabled={rows.isPending}
          onPress={() => {
            setOpen(true)
            rows.mutate()
          }}
        >
          <LuEye size={13} />
          {open ? t.readAgain : t.show}
        </Button>
      </div>
      {open && rows.data !== undefined ? (
        <div className="border-t border-line">
          <ResultTable columns={rows.data.columns} rows={rows.data.rows} />
        </div>
      ) : null}
      {rows.isError ? (
        <p className="border-t border-line px-3 py-2 text-code text-danger">{t.unreadable}</p>
      ) : null}
    </li>
  )
}

/**
 * What the fixes make of the rows, before they are run. Nothing here writes: each query is a
 * SELECT the database answers from the rows it holds now, so the result is what the migration
 * would leave behind rather than what it has left.
 */
export function Previews({ previews }: { readonly previews: Plan['previews'] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {previews.map((preview) => (
        <Preview key={preview.modelName} preview={preview} />
      ))}
    </ul>
  )
}
