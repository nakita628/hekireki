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

import type { migrateClient } from '../../api/index.js'
import { CodeBlock } from '../../components/code-block.js'
import { How } from './how.js'
import { useMessages } from './language.js'
import { CANDIDATE_REASONS, CANDIDATES, CHOICES, REASONS, TOPICS } from './messages.js'
import { useCheckText } from './text.js'

type Plan = InferResponseType<typeof migrateClient.migrate.plan.$post, 200>
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

type ChoiceText = (typeof CHOICES)['ja']
type Suggestion = Check['suggestion']
type Candidate = Check['candidates'][number]
type Place = Check['destinations'][number]
type Topics = Readonly<Record<string, ((facts: Check['facts']) => string) | undefined>>
type Labels = Readonly<Record<string, string | undefined>>

/** What the field asks to have written for a choice. */
function promptOf(choice: string, t: ChoiceText) {
  if (choice === 'sql') return t.promptSql
  if (choice === 'rename') return t.promptRename
  if (choice === 'move') return t.promptMove
  if (choice === 'map') return t.promptMap
  return choice === 'value' ? t.promptValue : t.promptOrder
}

/** What is written for each choice to begin with: the suggestion's value, then the decision's. */
function initialWritten(suggestion: Suggestion, decision: Decision | null) {
  return {
    ...(suggestion?.value === null || suggestion === null
      ? {}
      : { [suggestion.choice]: suggestion.value }),
    ...(decision?.value === null || decision === null ? {} : { [decision.choice]: decision.value }),
  }
}

/**
 * What the card is about. Once decided, the count is of the rows the decision leaves: the title
 * says what it is about.
 */
function titleOf(
  check: Check | null,
  decision: Decision | null,
  describe: (check: Check) => string,
  topics: Topics,
) {
  if (check !== null && decision === null) return describe(check)
  const kind = check?.kind ?? decision?.kind ?? ''
  const topic = topics[kind] ?? topics['other'] ?? (() => '')
  return topic(check?.facts ?? { model: decision?.modelName ?? '', field: decision?.field ?? '' })
}

/** The decision as the header repeats it: the choice, and what was written for it. */
function chosenOf(decision: Decision | null, labels: Labels, empty: string) {
  if (decision === null) return null
  const label = labels[decision.choice] ?? decision.choice
  if (decision.value === null) return label
  return `${label} · ${decision.value === '' ? empty : decision.value}`
}

function choicesOf(check: Check | null, decision: Decision | null): readonly string[] {
  return check?.choices ?? (decision === null ? [] : [decision.choice])
}

/** The choice the card opens on: the one decided, else the one suggested, else the first. */
function openingChoice(
  decision: Decision | null,
  suggestion: Suggestion,
  choices: readonly string[],
) {
  return decision?.choice ?? suggestion?.choice ?? choices[0] ?? ''
}

/** Whether there is nothing to decide yet: no choice, or one that waits for something written. */
function cannotDecide(choice: string, needsValue: boolean, value: string) {
  return choice === '' || (needsValue && value.trim() === '')
}

function isBlocking(check: Check | null) {
  return check?.status === 'blocking' || check?.status === 'failed'
}

function DecideButtons({
  decided,
  busy,
  disabled,
  onDecide,
  onUndo,
}: {
  readonly decided: boolean
  readonly busy: boolean
  readonly disabled: boolean
  readonly onDecide: () => void
  readonly onUndo: () => void
}) {
  const t = useMessages(CHOICES)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="primary" isDisabled={disabled} onPress={onDecide}>
        <LuCheck size={13} />
        {decided ? t.change : t.use}
      </Button>
      {decided ? (
        <Button size="sm" variant="ghost" isDisabled={busy} onPress={onUndo}>
          <LuUndo2 size={13} />
          {t.undo}
        </Button>
      ) : null}
    </div>
  )
}

/** The value a decision is sent with: a fill value even when empty, anything else when written. */
function decidedValue(choice: string, value: string, takesValue: boolean) {
  if (choice === 'value') return value
  return takesValue && value.trim() !== '' ? value : null
}

function CardHeader({
  title,
  chosen,
  decided,
  blocking,
  open,
  onToggle,
}: {
  readonly title: string
  readonly chosen: string | null
  readonly decided: boolean
  readonly blocking: boolean
  readonly open: boolean
  readonly onToggle: () => void
}) {
  const t = useMessages(CHOICES)
  return (
    <button
      type="button"
      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
      onClick={onToggle}
    >
      <span className="mt-0.5 shrink-0">
        {decided ? (
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
        className={`shrink-0 rounded-full border px-2 py-px text-code ${decided ? 'border-ok/30 bg-ok/10 text-ok' : 'border-danger/30 bg-danger/10 text-danger'}`}
      >
        {decided ? t.decided : t.undecided}
      </span>
      <span className="mt-0.5 shrink-0 text-muted">
        {open ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
      </span>
    </button>
  )
}

/** The SQL a decision runs before the schema changes, or that it runs inside the migration. */
function DecisionSql({ statements }: { readonly statements: readonly string[] }) {
  const t = useMessages(CHOICES)
  if (statements.length === 0) {
    return <p className="m-0 text-code text-muted">{t.sqlInMigration}</p>
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-code text-muted">{t.sqlOfDecision}</span>
      <CodeBlock code={statements.map((sql) => `${sql};`).join('\n')} language="sql" />
    </div>
  )
}

function isSuggested(suggestion: Suggestion, candidate: Candidate) {
  return suggestion?.choice === candidate.choice && suggestion.value === candidate.value
}

function CandidateItem({
  candidate,
  index,
  picked,
  suggested,
  busy,
  onPick,
}: {
  readonly candidate: Candidate
  readonly index: number
  readonly picked: boolean
  readonly suggested: boolean
  readonly busy: boolean
  readonly onPick: () => void
}) {
  const tc = useMessages(CANDIDATES)
  const candidateReasons: Labels = useMessages(CANDIDATE_REASONS)
  return (
    <li
      className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 ${picked ? 'border-accent bg-accent-soft' : 'border-line'}`}
    >
      <span className="w-5 shrink-0 text-right font-mono text-code text-muted">{index + 1}.</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono">
            {(candidate.choice === 'move' ? tc.move : tc.rename)(candidate.value ?? '')}
          </span>
          {suggested ? (
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
      <Button size="sm" variant={picked ? 'secondary' : 'ghost'} isDisabled={busy} onPress={onPick}>
        {picked ? tc.picked : tc.pick}
      </Button>
    </li>
  )
}

/** Where the values of a dropped column may have gone, likeliest first. */
function Candidates({
  check,
  choice,
  value,
  busy,
  onPick,
}: {
  readonly check: Check
  readonly choice: string
  readonly value: string
  readonly busy: boolean
  readonly onPick: (candidate: Candidate) => void
}) {
  const tc = useMessages(CANDIDATES)
  if (check.candidates.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5" data-testid="candidates">
      <span className="text-body font-semibold">{tc.title}</span>
      <span className="text-code text-muted">{tc.note}</span>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {check.candidates.map((candidate, index) => (
          <CandidateItem
            key={`${candidate.choice}:${candidate.value ?? ''}`}
            candidate={candidate}
            index={index}
            picked={choice === candidate.choice && value === (candidate.value ?? '')}
            suggested={isSuggested(check.suggestion, candidate)}
            busy={busy}
            onPick={() => {
              onPick(candidate)
            }}
          />
        ))}
      </ol>
    </div>
  )
}

function ChoiceOption({
  one,
  checked,
  name,
  suggestion,
  facts,
  onChoose,
}: {
  readonly one: string
  readonly checked: boolean
  readonly name: string
  readonly suggestion: Suggestion
  readonly facts: Check['facts']
  readonly onChoose: () => void
}) {
  const t = useMessages(CHOICES)
  const labels: Labels = t
  const reasons: Topics = useMessages(REASONS)
  return (
    <label
      className={`flex cursor-pointer flex-col gap-1 rounded-md border px-3 py-2 ${checked ? 'border-accent bg-accent-soft' : 'border-line'}`}
    >
      <span className="flex flex-wrap items-center gap-2">
        <input
          type="radio"
          name={name}
          className="accent-accent"
          checked={checked}
          onChange={onChoose}
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
          {(reasons[suggestion.reason] ?? (() => ''))(facts)}
        </span>
      ) : null}
    </label>
  )
}

/** The columns a rename or a move can name; the combo box filters them as the name is typed. */
function DestinationBox({
  prompt,
  value,
  places,
  onWrite,
}: {
  readonly prompt: string
  readonly value: string
  readonly places: readonly Place[]
  readonly onWrite: (next: string) => void
}) {
  const t = useMessages(CHOICES)
  return (
    <ComboBox
      className="max-w-xl"
      allowsCustomValue
      menuTrigger="focus"
      defaultFilter={(text, input) => text.toLowerCase().includes(input.toLowerCase())}
      inputValue={value}
      onInputChange={(next) => {
        if (next !== value) onWrite(next)
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
  )
}

/** Where what a choice takes is written: a destination to pick, or a value to type. */
function ValueInput({
  check,
  choice,
  value,
  takesValue,
  onWrite,
}: {
  readonly check: Check | null
  readonly choice: string
  readonly value: string
  readonly takesValue: boolean
  readonly onWrite: (next: string) => void
}) {
  const t = useMessages(CHOICES)
  const prompt = promptOf(choice, t)
  if ((choice === 'rename' || choice === 'move') && check !== null) {
    return (
      <DestinationBox
        prompt={prompt}
        value={value}
        places={check.destinations.filter((place) => place.choice === choice)}
        onWrite={onWrite}
      />
    )
  }
  if (!takesValue) return null
  return (
    <TextField className="max-w-xl" value={value} onChange={onWrite}>
      <Label>{prompt}</Label>
      <Input className={choice === 'sql' ? 'font-mono' : ''} />
    </TextField>
  )
}

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
  const labels: Labels = t
  const describe = useCheckText()
  const topics: Topics = useMessages(TOPICS)
  const suggestion = check?.suggestion ?? null
  const choices = choicesOf(check, decision)
  const blocking = isBlocking(check)
  const [open, setOpen] = useState(decision === null)
  const [choice, setChoice] = useState(() => openingChoice(decision, suggestion, choices))
  // What is written for each choice, kept apart so moving between them loses nothing.
  const [written, setWritten] = useState<Readonly<Record<string, string>>>(() =>
    initialWritten(suggestion, decision),
  )
  const value = written[choice] ?? ''
  const needsValue = NEEDS_VALUE.has(choice)
  const takesValue = needsValue || TAKES_VALUE.has(choice)
  const title = titleOf(check, decision, describe, topics)
  const write = (next: string) => {
    setWritten((current) => ({ ...current, [choice]: next }))
  }

  return (
    <li
      className={`rounded-lg border bg-surface ${decision === null && blocking ? 'border-danger/40' : 'border-line'}`}
    >
      <CardHeader
        title={title}
        chosen={chosenOf(decision, labels, t.empty)}
        decided={decision !== null}
        blocking={blocking}
        open={open}
        onToggle={() => {
          setOpen((current) => !current)
        }}
      />
      {open && choices.length > 0 ? (
        <div
          className={`grid gap-4 border-t border-line px-3 py-3 pl-9 ${check === null ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]'}`}
        >
          <div className="flex min-w-0 flex-col gap-3">
            {decision === null ? null : <DecisionSql statements={statements} />}
            {check === null ? null : (
              <CheckHints
                check={check}
                undecided={decision === null}
                choice={choice}
                value={value}
                busy={busy}
                onPick={(candidate) => {
                  setChoice(candidate.choice)
                  setWritten((current) => ({
                    ...current,
                    [candidate.choice]: candidate.value ?? '',
                  }))
                }}
              />
            )}
            <div role="radiogroup" aria-label={title} className="flex flex-col gap-1.5">
              {choices.map((one) => (
                <ChoiceOption
                  key={one}
                  one={one}
                  checked={one === choice}
                  name={title}
                  suggestion={suggestion}
                  facts={check?.facts ?? {}}
                  onChoose={() => {
                    setChoice(one)
                  }}
                />
              ))}
            </div>
            <ValueInput
              check={check}
              choice={choice}
              value={value}
              takesValue={takesValue}
              onWrite={write}
            />
            <DecideButtons
              decided={decision !== null}
              busy={busy}
              disabled={busy || cannotDecide(choice, needsValue, value)}
              onDecide={() => {
                setOpen(false)
                onDecide(choice, decidedValue(choice, value, takesValue))
              }}
              onUndo={onUndo}
            />
          </div>
          {check === null ? null : <How check={check} choice={choice} value={value} />}
        </div>
      ) : null}
    </li>
  )
}

/** What the check knows about where the values went: nowhere it can find, or its candidates. */
function CheckHints({
  check,
  undecided,
  choice,
  value,
  busy,
  onPick,
}: {
  readonly check: Check
  readonly undecided: boolean
  readonly choice: string
  readonly value: string
  readonly busy: boolean
  readonly onPick: (candidate: Candidate) => void
}) {
  const tc = useMessages(CANDIDATES)
  return (
    <>
      {check.kind === 'column-dropped' && undecided && check.candidates.length === 0 ? (
        <p className="m-0 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-body text-danger">
          {tc.none(check.count ?? 0)}
        </p>
      ) : null}
      <Candidates check={check} choice={choice} value={value} busy={busy} onPick={onPick} />
    </>
  )
}
