import { Button } from '@heroui/react'
import type { InferResponseType } from 'hono/client'
import { useState } from 'react'
import {
  LuChevronDown,
  LuChevronRight,
  LuCircleAlert,
  LuCircleCheck,
  LuDatabase,
  LuPlay,
  LuTable,
  LuTriangleAlert,
} from 'react-icons/lu'

import { CodeBlock } from '../../components/code-block.js'
import type { client } from '../../lib/index.js'
import { useMessages } from './language.js'
import { STEPS } from './messages.js'
import { outcomeOf } from './outcome.js'
import type { StepOutcome } from './outcome.js'
import { useStepLines } from './text.js'

type Plan = InferResponseType<typeof client.migrate.plan.$post, 200>
type Step = Plan['steps'][number]

function StepIcon({ step, outcome }: { readonly step: Step; readonly outcome?: StepOutcome }) {
  const { ran, failed } = outcomeOf(outcome)
  if (failed) return <LuCircleAlert className="text-danger" size={16} />
  if (ran) return <LuCircleCheck className="text-ok" size={16} />
  return step.kind === 'fix' ? (
    <LuTable className="text-muted" size={16} />
  ) : (
    <LuDatabase className="text-muted" size={16} />
  )
}

/**
 * One step of the plan, with what it did once it has run. What it does comes first; the SQL is
 * a press away for when that is not enough.
 */
function StepCard({
  index,
  step,
  outcome,
  disabled,
  onRun,
}: {
  readonly index: number
  readonly step: Step
  readonly outcome: StepOutcome | undefined
  readonly disabled: boolean
  /** Runs the step; null where the steps are only shown. */
  readonly onRun: (() => void) | null
}) {
  const t = useMessages(STEPS)
  const lines = useStepLines()(step)
  const { ran, failed } = outcomeOf(outcome)
  const [showSql, setShowSql] = useState(false)
  return (
    <li className="rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <StepIcon step={step} outcome={outcome} />
        <span className="font-semibold tabular-nums">{index + 1}.</span>
        <span className="rounded-full border border-line bg-canvas px-2 py-px text-code text-muted">
          {step.kind === 'fix' ? t.dataStep : t.schemaStep}
        </span>
        {step.destructive ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-2 py-px text-code text-danger">
            <LuTriangleAlert size={12} />
            {t.losesData}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2.5">
          {!ran && step.rows !== null ? (
            <span className="text-code text-muted tabular-nums">{t.rowsToChange(step.rows)}</span>
          ) : null}
          {ran && !failed ? (
            <span className="text-code text-muted tabular-nums">
              {outcome?.affected === null || outcome?.affected === undefined
                ? t.done
                : t.rowsChanged(outcome.affected)}
            </span>
          ) : null}
          {onRun === null ? null : (
            <Button
              size="sm"
              variant={ran ? 'ghost' : step.destructive ? 'danger' : 'primary'}
              isDisabled={disabled}
              onPress={onRun}
            >
              <LuPlay size={13} />
              {ran ? t.runAgain : t.run}
            </Button>
          )}
        </span>
      </div>
      <div className="px-3 pb-2.5 pl-9">
        <ul className="m-0 mb-1 flex list-none flex-col gap-0.5 p-0 text-body">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            setShowSql((current) => !current)
          }}
        >
          {showSql ? <LuChevronDown size={13} /> : <LuChevronRight size={13} />}
          {t.statements(step.statements.length)}
        </Button>
        {showSql
          ? step.statements.map((sql) => <CodeBlock key={sql} code={sql} language="sql" />)
          : null}
        {failed ? (
          <p className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-code text-danger">
            {outcome?.error}
          </p>
        ) : null}
      </div>
    </li>
  )
}

/**
 * The plan as its steps, in the order they run. With `runnable`, each can be run on its own, so
 * the rows can be looked at between them: none of the databases undoes a DDL statement once done.
 */
export function Steps({
  plan,
  outcomes,
  running,
  onRun,
}: {
  readonly plan: Plan
  readonly outcomes: Readonly<Record<number, StepOutcome>>
  readonly running: boolean
  /** Runs a step on its own; null where the steps are only shown. */
  readonly onRun: ((index: number) => void) | null
}) {
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {plan.steps.map((step, index) => (
        <StepCard
          key={step.statements.join('\n')}
          index={index}
          step={step}
          outcome={outcomes[index]}
          disabled={running}
          onRun={
            onRun === null
              ? null
              : () => {
                  onRun(index)
                }
          }
        />
      ))}
    </ol>
  )
}
