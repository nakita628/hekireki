import { Button } from '@heroui/react'
import { useMutation } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'
import type { InferResponseType } from 'hono/client'
import { useState } from 'react'
import { LuCircleCheck, LuDownload, LuEye, LuTriangleAlert } from 'react-icons/lu'

import { ResultTable } from '../../components/result-table.js'
import { client } from '../../lib/index.js'
import { toCsv } from '../data/cells.js'
import { useMessages } from './language.js'
import { losesData } from './loss.js'
import { CANDIDATES, IMPACT } from './messages.js'
import { useCheckText } from './text.js'

type Plan = InferResponseType<typeof client.migrate.plan.$post, 200>
type Check = Plan['checks'][number]

/**
 * One loss: what goes, said in a sentence, and the rows themselves a press away, read from the
 * database as it is now and kept as a CSV for whoever wants them beside the backup.
 */
function Loss({ check }: { readonly check: Check }) {
  const t = useMessages(IMPACT)
  const tc = useMessages(CANDIDATES)
  const describe = useCheckText()
  const [open, setOpen] = useState(false)
  const rows = useMutation({
    mutationFn: (sql: string) => parseResponse(client.db.sql.$post({ json: { sql } })),
  })
  return (
    <li className="rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body">{describe(check)}</span>
          {check.candidates.length === 0 ? null : (
            <span className="text-code text-accent-text">
              {tc.lossNote(check.candidates.length)}
            </span>
          )}
        </span>
        <Button
          size="sm"
          variant="ghost"
          isDisabled={rows.isPending || check.lost === null}
          onPress={() => {
            if (open) {
              setOpen(false)
              return
            }
            setOpen(true)
            if (check.lost !== null) rows.mutate(check.lost)
          }}
        >
          <LuEye size={13} />
          {open ? t.hide : t.show}
        </Button>
      </div>
      {!open ? null : rows.isPending ? (
        <p className="m-0 border-t border-line px-3 py-2 text-code text-muted">{t.reading}</p>
      ) : rows.isError ? (
        <p className="m-0 border-t border-line px-3 py-2 text-code text-danger">{t.unreadable}</p>
      ) : rows.data === undefined ? null : rows.data.rowCount === 0 ? (
        <p className="m-0 border-t border-line px-3 py-2 text-code text-muted">{t.none}</p>
      ) : (
        <div className="flex flex-col border-t border-line">
          <div className="flex flex-wrap items-center gap-2.5 px-3 py-1.5">
            <span className="text-code text-muted">
              {t.shown(rows.data.rows.length, rows.data.rowCount)}
            </span>
            <Button
              className="ml-auto"
              size="sm"
              variant="ghost"
              onPress={() => {
                if (rows.data === undefined) return
                const url = URL.createObjectURL(
                  new Blob([toCsv(rows.data.columns, rows.data.rows)], { type: 'text/csv' }),
                )
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = `${check.subject.replaceAll(/[^\w.-]/gu, '_')}-lost.csv`
                anchor.click()
                URL.revokeObjectURL(url)
              }}
            >
              <LuDownload size={13} />
              {t.csv}
            </Button>
          </div>
          <ResultTable columns={rows.data.columns} rows={rows.data.rows} />
        </div>
      )}
    </li>
  )
}

/**
 * What the migration does to the data, before anything runs: every change that loses rows or
 * values, each with the rows it loses to look at, or, when nothing is lost, that nothing is. A
 * dropped column is the moment a person is least sure of, so it is said first and plainly.
 */
export function Impact({
  checks,
  steps,
}: {
  readonly checks: Plan['checks']
  readonly steps: Plan['steps']
}) {
  const t = useMessages(IMPACT)
  const losses = checks.filter(losesData)
  const fixes = steps.filter((step) => step.kind === 'fix').length
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 ${losses.length === 0 ? 'border-ok/30 bg-ok/5' : 'border-danger/40 bg-danger/5'}`}
      data-testid="impact"
    >
      <span className="text-body font-semibold">{t.title}</span>
      {losses.length === 0 ? (
        <span className="flex items-center gap-1.5 text-body text-ok">
          <LuCircleCheck size={14} />
          {t.safe}
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5 font-semibold text-danger">
            <LuTriangleAlert size={15} />
            {t.losesTitle(losses.length)}
          </span>
          <p className="m-0 text-body">{t.losesNote}</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {losses.map((check) => (
              <Loss key={`${check.kind}:${check.subject}`} check={check} />
            ))}
          </ul>
        </>
      )}
      {fixes === 0 ? null : <span className="text-body text-muted">{t.changesRows(fixes)}</span>}
    </div>
  )
}
