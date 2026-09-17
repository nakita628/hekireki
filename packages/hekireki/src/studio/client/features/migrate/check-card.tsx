import { Button, ComboBox, Input, Label, ListBox, TextField } from '@heroui/react'
import type { InferResponseType } from 'hono/client'
import { useState } from 'react'
import {
  LuCheck,
  LuChevronDown,
  LuChevronRight,
  LuCircleAlert,
  LuCircleCheck,
  LuSparkles,
  LuTrash2,
  LuUndo2,
} from 'react-icons/lu'

import { CodeBlock } from '../../components/code-block.js'
import type { client } from '../../lib/index.js'
import { How } from './how.js'
import { useMessages } from './language.js'
import { CANDIDATE_REASONS, CANDIDATES, CHOICES, REASONS, TOPICS } from './messages.js'
import { useCheckText } from './text.js'

type Plan = InferResponseType<typeof client.migrate.plan.$post, 200>
type Check = Plan['checks'][number]

type Decision = {
  readonly kind: string
  readonly modelName: string
  readonly field: string
  readonly choice: string
  readonly value: string | null
}

/** The choices that mean nothing until something is written for them. */
const NEEDS_VALUE = new Set(['sql', 'rename', 'move', 'map'])

/** The choices that take something written, and mean something without it: a value may be empty. */
const TAKES_VALUE = new Set([
  'value',
  'keep-first-delete',
  'keep-last-delete',
  'keep-first-null',
  'keep-last-null',
])

/** The choices that delete rows, said beside them before they are taken. */
const DELETES_ROWS = new Set(['delete', 'keep-first-delete', 'keep-last-delete'])

/**
 * One thing the data needs decided: what the schema asks of it and how many rows are in the way,
 * the choices there are, the one suggested and why, and what was decided. A decision whose check
 * no longer appears (a rename, once made, leaves no column dropped) is shown from the decision.
 */
export function CheckCard({
  check,
  decision,
  busy,
  onDecide,
  onUndo,
  statements,
}: {
  readonly check: Check | null
  readonly decision: Decision | null
  readonly busy: boolean
  readonly onDecide: (choice: string, value: string | null) => void
  readonly onUndo: () => void
  /** The statements the decision's fix runs before the schema changes; empty when it runs none of its own. */
  readonly statements: readonly string[]
}) {
  const t = useMessages(CHOICES)
  const tc = useMessages(CANDIDATES)
  const candidateReasons: Readonly<Record<string, string | undefined>> =
    useMessages(CANDIDATE_REASONS)
  const labels: Readonly<Record<string, string | undefined>> = t
  const reasons: Readonly<Record<string, ((facts: Check['facts']) => string) | undefined>> =
    useMessages(REASONS)
  const describe = useCheckText()
  const topics: Readonly<Record<string, ((facts: Check['facts']) => string) | undefined>> =
    useMessages(TOPICS)
  const suggestion = check?.suggestion ?? null
  const choices = check?.choices ?? (decision === null ? [] : [decision.choice])
  const blocking = check?.status === 'blocking' || check?.status === 'failed'
  const [open, setOpen] = useState(decision === null)
  const [choice, setChoice] = useState(decision?.choice ?? suggestion?.choice ?? choices[0] ?? '')
  // What is written for each choice, kept apart so moving between them loses nothing.
  const [written, setWritten] = useState<Readonly<Record<string, string>>>(() => ({
    ...(suggestion?.value === null || suggestion === null
      ? {}
      : { [suggestion.choice]: suggestion.value }),
    ...(decision?.value === null || decision === null ? {} : { [decision.choice]: decision.value }),
  }))
  const value = written[choice] ?? ''
  // The columns a rename or a move can name; the combo box filters them as the name is typed.
  const places = (check?.destinations ?? []).filter((place) => place.choice === choice)
  const needsValue = NEEDS_VALUE.has(choice)
  const takesValue = needsValue || TAKES_VALUE.has(choice)
  const prompt =
    choice === 'sql'
      ? t.promptSql
      : choice === 'rename'
        ? t.promptRename
        : choice === 'move'
          ? t.promptMove
          : choice === 'map'
            ? t.promptMap
            : choice === 'value'
              ? t.promptValue
              : t.promptOrder
  // Once decided, the count is of the rows the decision leaves: the title says what it is about.
  const kind = check?.kind ?? decision?.kind ?? ''
  const title =
    check !== null && decision === null
      ? describe(check)
      : (topics[kind] ?? topics.other ?? (() => ''))(
          check?.facts ?? { model: decision?.modelName ?? '', field: decision?.field ?? '' },
        )
  const chosen =
    decision === null
      ? null
      : `${labels[decision.choice] ?? decision.choice}${decision.value === null ? '' : ` · ${decision.value === '' ? t.empty : decision.value}`}`

  return (
    <li
      className={`rounded-lg border bg-surface ${decision === null && blocking ? 'border-danger/40' : 'border-line'}`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        <span className="mt-0.5 shrink-0">
          {decision !== null ? (
            <LuCircleCheck className="text-ok" size={16} />
          ) : (
            <LuCircleAlert className={blocking ? 'text-danger' : 'text-accent-text'} size={16} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span>{title}</span>
          {chosen === null ? null : (
            <span className="truncate text-code text-muted">
              {t.chosen}: {chosen}
            </span>
          )}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-px text-code ${decision === null ? 'border-danger/30 bg-danger/10 text-danger' : 'border-ok/30 bg-ok/10 text-ok'}`}
        >
          {decision === null ? t.undecided : t.decided}
        </span>
        <span className="mt-0.5 shrink-0 text-muted">
          {open ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
        </span>
      </button>

      {open && choices.length > 0 ? (
        <div
          className={`grid gap-4 border-t border-line px-3 py-3 pl-9 ${check === null ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]'}`}
        >
          <div className="flex min-w-0 flex-col gap-3">
            {decision === null ? null : statements.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="text-code text-muted">{t.sqlOfDecision}</span>
                <CodeBlock code={statements.map((sql) => `${sql};`).join('\n')} language="sql" />
              </div>
            ) : (
              <p className="m-0 text-code text-muted">{t.sqlInMigration}</p>
            )}
            {check?.kind === 'column-dropped' &&
            decision === null &&
            check.candidates.length === 0 ? (
              <p className="m-0 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-body text-danger">
                {tc.none(check.count ?? 0)}
              </p>
            ) : null}
            {check === null || check.candidates.length === 0 ? null : (
              <div className="flex flex-col gap-1.5" data-testid="candidates">
                <span className="text-body font-semibold">{tc.title}</span>
                <span className="text-code text-muted">{tc.note}</span>
                <ol className="m-0 flex list-none flex-col gap-1 p-0">
                  {check.candidates.map((candidate, index) => {
                    const picked = choice === candidate.choice && value === (candidate.value ?? '')
                    return (
                      <li
                        key={`${candidate.choice}:${candidate.value ?? ''}`}
                        className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 ${picked ? 'border-accent bg-accent-soft' : 'border-line'}`}
                      >
                        <span className="w-5 shrink-0 text-right font-mono text-code text-muted">
                          {index + 1}.
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono">
                              {(candidate.choice === 'move' ? tc.move : tc.rename)(
                                candidate.value ?? '',
                              )}
                            </span>
                            {suggestion?.choice === candidate.choice &&
                            suggestion.value === candidate.value ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-px text-code text-white">
                                <LuSparkles size={11} />
                                {tc.likeliest}
                              </span>
                            ) : null}
                          </span>
                          <span className="text-code text-muted">
                            {candidateReasons[candidate.reason] ?? candidate.reason}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant={picked ? 'secondary' : 'ghost'}
                          isDisabled={busy}
                          onPress={() => {
                            setChoice(candidate.choice)
                            setWritten((current) => ({
                              ...current,
                              [candidate.choice]: candidate.value ?? '',
                            }))
                          }}
                        >
                          {picked ? tc.picked : tc.pick}
                        </Button>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
            <div role="radiogroup" aria-label={title} className="flex flex-col gap-1.5">
              {choices.map((one) => (
                <label
                  key={one}
                  className={`flex cursor-pointer flex-col gap-1 rounded-md border px-3 py-2 ${one === choice ? 'border-accent bg-accent-soft' : 'border-line'}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <input
                      type="radio"
                      name={title}
                      className="accent-accent"
                      checked={one === choice}
                      onChange={() => {
                        setChoice(one)
                      }}
                    />
                    <span>{labels[one] ?? one}</span>
                    {suggestion?.choice === one ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-px text-code text-white">
                        <LuSparkles size={11} />
                        {t.suggested}
                      </span>
                    ) : null}
                    {DELETES_ROWS.has(one) ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-2 py-px text-code text-danger">
                        <LuTrash2 size={11} />
                        {t.losesRows}
                      </span>
                    ) : null}
                  </span>
                  {suggestion?.choice === one ? (
                    <span className="pl-6 text-code text-muted">
                      {(reasons[suggestion.reason] ?? (() => ''))(check?.facts ?? {})}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
            {(choice === 'rename' || choice === 'move') && check !== null ? (
              <ComboBox
                className="max-w-xl"
                allowsCustomValue
                menuTrigger="focus"
                defaultFilter={(text, input) => text.toLowerCase().includes(input.toLowerCase())}
                inputValue={value}
                onInputChange={(next) => {
                  if (next !== value) setWritten((current) => ({ ...current, [choice]: next }))
                }}
              >
                <Label>{prompt}</Label>
                <ComboBox.InputGroup>
                  <Input className="font-mono" />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox
                    renderEmptyState={() => (
                      <p className="m-0 px-3 py-2 text-code text-muted">{t.noDestination}</p>
                    )}
                  >
                    {places.map((place) => (
                      <ListBox.Item
                        key={place.value}
                        id={place.value}
                        textValue={place.value}
                        className="gap-2"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono">{place.value}</span>
                        <span className="shrink-0 text-code text-muted">{place.type}</span>
                        {place.fits ? null : (
                          <span className="shrink-0 text-code text-accent-text">{t.misfits}</span>
                        )}
                        {place.created ? (
                          <span className="shrink-0 text-code text-accent-text">{t.newTable}</span>
                        ) : null}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            ) : takesValue ? (
              <TextField
                className="max-w-xl"
                value={value}
                onChange={(next) => {
                  setWritten((current) => ({ ...current, [choice]: next }))
                }}
              >
                <Label>{prompt}</Label>
                <Input className={choice === 'sql' ? 'font-mono' : ''} />
              </TextField>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                isDisabled={busy || choice === '' || (needsValue && value.trim() === '')}
                onPress={() => {
                  setOpen(false)
                  onDecide(
                    choice,
                    choice === 'value' ? value : takesValue && value.trim() !== '' ? value : null,
                  )
                }}
              >
                <LuCheck size={13} />
                {decision === null ? t.use : t.change}
              </Button>
              {decision === null ? null : (
                <Button size="sm" variant="ghost" isDisabled={busy} onPress={onUndo}>
                  <LuUndo2 size={13} />
                  {t.undo}
                </Button>
              )}
            </div>
          </div>
          {check === null ? null : <How check={check} choice={choice} value={value} />}
        </div>
      ) : null}
    </li>
  )
}
