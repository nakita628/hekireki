import { Button } from '@heroui/react'
import type { InferResponseType } from 'hono/client'
import { LuCircleAlert, LuCircleCheck, LuCircleDashed, LuFlaskConical } from 'react-icons/lu'

import type { migrateClient } from '../../api/index.js'
import { CodeBlock } from '../../components/code-block.js'
import { useMessages } from './language.js'
import { REHEARSAL } from './messages.js'
import { RowCounts } from './row-counts.js'

type Result = InferResponseType<typeof migrateClient.migrate.rehearse.$post, 200>

type Messages = (typeof REHEARSAL)['ja']
type RehearsedStep = Result['steps'][number]

function borderOf(result: Result | null, required: boolean) {
  if (result !== null) return result.ok ? 'border-ok/40 bg-ok/5' : 'border-danger/40 bg-danger/5'
  return required ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface'
}

/** Where the rehearsal runs, which is what makes it leave nothing behind. */
function explainOf(dialect: string | null, t: Messages) {
  if (dialect === 'postgresql') return t.explainPostgres
  return dialect === 'mysql' ? t.explainMysql : t.explainSqlite
}

function buttonLabelOf(pending: boolean, result: Result | null, t: Messages) {
  if (pending) return t.running
  return result === null ? t.run : t.again
}

function StepIcon({ step }: { readonly step: RehearsedStep }) {
  if (!step.ran) return <LuCircleDashed className="text-muted" size={14} />
  return step.ok ? (
    <LuCircleCheck className="text-ok" size={14} />
  ) : (
    <LuCircleAlert className="text-danger" size={14} />
  )
}

function stepNoteOf(step: RehearsedStep, t: Messages) {
  if (!step.ran) return t.notRun
  return step.ok ? t.rows(step.affected ?? 0) : ''
}

/** One statement of the rehearsal: whether it went through, and why not when it did not. */
function StepLine({ step, index }: { readonly step: RehearsedStep; readonly index: number }) {
  const t = useMessages(REHEARSAL)
  return (
    <li className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-body">
        <StepIcon step={step} />
        <span className="font-semibold">{t.step(index + 1)}</span>
        <span className="text-muted">{stepNoteOf(step, t)}</span>
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
  )
}

/** Whether the rehearsed database came out as the schema, and how it differs when it did not. */
function SchemaComparison({ result }: { readonly result: Result }) {
  const t = useMessages(REHEARSAL)
  if (result.schemaMatches === null) {
    return <span className="text-body text-muted">{t.notCompared}</span>
  }
  if (result.schemaMatches) {
    return (
      <span className="flex items-center gap-1.5 text-body text-ok">
        <LuCircleCheck size={14} />
        {t.matches}
      </span>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-body text-danger">
        <LuCircleAlert size={14} />
        {t.differs}
      </span>
      {result.difference === '' ? null : <CodeBlock code={result.difference} language="sql" />}
    </div>
  )
}

function RehearsalResult({ result }: { readonly result: Result }) {
  const t = useMessages(REHEARSAL)
  return (
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
          <StepLine key={index} step={step} index={index} />
        ))}
      </ol>
      <div className="flex flex-col gap-1">
        <span className="text-body font-semibold">{t.tables}</span>
        <RowCounts tables={result.tables} />
      </div>
      <SchemaComparison result={result} />
      {result.limitations.includes('outside-transaction') ? (
        <p className="m-0 text-body text-accent-text">{t.outsideTransaction}</p>
      ) : null}
      {result.limitations.includes('locks-tables') ? (
        <p className="m-0 text-body text-muted">{t.locksTables}</p>
      ) : null}
    </div>
  )
}

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
      className={`flex flex-col gap-2.5 rounded-lg border px-3 py-2.5 ${borderOf(result, required)}`}
    >
      <p className="m-0 text-body text-muted">{explainOf(dialect, t)}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          variant={result === null ? 'primary' : 'secondary'}
          isDisabled={disabled || pending}
          onPress={onRehearse}
        >
          <LuFlaskConical size={14} />
          {buttonLabelOf(pending, result, t)}
        </Button>
        {result === null ? (
          <span className="text-body">{required ? t.required : t.recommended}</span>
        ) : null}
      </div>
      {result === null ? null : <RehearsalResult result={result} />}
    </div>
  )
}
