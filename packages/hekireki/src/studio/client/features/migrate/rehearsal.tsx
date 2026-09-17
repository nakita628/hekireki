import { Button } from '@heroui/react'
import type { InferResponseType } from 'hono/client'
import { LuCircleAlert, LuCircleCheck, LuCircleDashed, LuFlaskConical } from 'react-icons/lu'

import { CodeBlock } from '../../components/code-block.js'
import type { client } from '../../lib/index.js'
import { useMessages } from './language.js'
import { REHEARSAL } from './messages.js'
import { RowCounts } from './row-counts.js'

type Result = InferResponseType<typeof client.migrate.rehearse.$post, 200>

/**
 * The migration run for real where nothing is kept: on a copy of a SQLite file, or in a
 * PostgreSQL transaction that is rolled back. What a person worries about before a run that
 * loses data is answered here with the database's own answer: whether every statement goes
 * through, how many rows each table has after, and whether the result is the schema.
 */
export function Rehearsal({
  dialect,
  result,
  required,
  pending,
  disabled,
  onRehearse,
}: {
  readonly dialect: string | null
  /** The rehearsal of the plan as it is now; null before one has run. */
  readonly result: Result | null
  /** Whether the run waits for a rehearsal that went through. */
  readonly required: boolean
  readonly pending: boolean
  readonly disabled: boolean
  readonly onRehearse: () => void
}) {
  const t = useMessages(REHEARSAL)
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-lg border px-3 py-2.5 ${result === null ? (required ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface') : result.ok ? 'border-ok/40 bg-ok/5' : 'border-danger/40 bg-danger/5'}`}
    >
      <p className="m-0 text-body text-muted">
        {dialect === 'postgresql' ? t.explainPostgres : t.explainSqlite}
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          variant={result === null ? 'primary' : 'secondary'}
          isDisabled={disabled || pending}
          onPress={onRehearse}
        >
          <LuFlaskConical size={14} />
          {pending ? t.running : result === null ? t.run : t.again}
        </Button>
        {result === null ? (
          <span className="text-body">{required ? t.required : t.recommended}</span>
        ) : null}
      </div>
      {result === null ? null : (
        <div className="flex flex-col gap-2.5" data-testid="rehearsal-result">
          <span
            className={`flex items-center gap-1.5 font-semibold ${result.ok ? 'text-ok' : 'text-danger'}`}
          >
            {result.ok ? <LuCircleCheck size={15} /> : <LuCircleAlert size={15} />}
            {result.ok ? t.passed : t.failed}
          </span>
          {result.ok ? null : <p className="m-0 text-body">{t.failedNote}</p>}
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {result.steps.map((step, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- the steps are the plan's, in order, and nothing reorders them
              <li key={index} className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-body">
                  {!step.ran ? (
                    <LuCircleDashed className="text-muted" size={14} />
                  ) : step.ok ? (
                    <LuCircleCheck className="text-ok" size={14} />
                  ) : (
                    <LuCircleAlert className="text-danger" size={14} />
                  )}
                  <span className="font-semibold">{t.step(index + 1)}</span>
                  <span className="text-muted">
                    {!step.ran ? t.notRun : step.ok ? t.rows(step.affected ?? 0) : ''}
                  </span>
                </span>
                {step.error === null ? null : (
                  <div className="ml-5 flex flex-col gap-1">
                    <pre className="m-0 overflow-auto rounded-md bg-surface px-2.5 py-2 font-mono text-code whitespace-pre-wrap text-danger">
                      {step.error}
                    </pre>
                    {step.statement === null ? null : (
                      <>
                        <span className="text-code text-muted">{t.statement}</span>
                        <CodeBlock code={step.statement} language="sql" />
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-1">
            <span className="text-body font-semibold">{t.tables}</span>
            <RowCounts tables={result.tables} />
          </div>
          {result.schemaMatches ? (
            <span className="flex items-center gap-1.5 text-body text-ok">
              <LuCircleCheck size={14} />
              {t.matches}
            </span>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-body text-danger">
                <LuCircleAlert size={14} />
                {t.differs}
              </span>
              {result.difference === '' ? null : (
                <CodeBlock code={result.difference} language="sql" />
              )}
            </div>
          )}
          {result.limitations.includes('outside-transaction') ? (
            <p className="m-0 text-body text-accent-text">{t.outsideTransaction}</p>
          ) : null}
          {result.limitations.includes('locks-tables') ? (
            <p className="m-0 text-body text-muted">{t.locksTables}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
