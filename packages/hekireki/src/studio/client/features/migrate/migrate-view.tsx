import { Button, Input, Label, TextField, toast } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { useEffect, useState } from 'react'
import {
  LuChevronDown,
  LuChevronRight,
  LuCircleCheck,
  LuLanguages,
  LuPlay,
  LuRefreshCw,
  LuRocket,
  LuSparkles,
  LuTrash2,
  LuTriangleAlert,
} from 'react-icons/lu'

import type { migrateClient } from '../../api/index.js'
import { CodeBlock } from '../../components/code-block.js'
import { ConfirmDialog } from '../../components/confirm-dialog.js'
import {
  getMigrateBackupsQueryKey,
  getMigrateBaselineQueryKey,
  getMigrateDecisionsQueryKey,
  getMigrateQueryKey,
  useDb,
  useMigrate,
  useMigrateDecisions,
  usePostMigrateBackupsRestore,
  usePostMigrateBaseline,
  usePostMigrateDeploy,
  usePostMigrateMigrationsRolledBack,
  usePostMigratePlan,
  usePostMigrateRehearse,
  usePutMigrateDecisions,
} from '../../hooks/index.js'
import { Backups } from './backups.js'
import { Baseline } from './baseline.js'
import { CheckCard } from './check-card.js'
import { FailureAlert } from './failure-alert.js'
import { useFailure } from './failure.js'
import { History } from './history.js'
import { Impact } from './impact.js'
import { useLanguageStore, useMessages } from './language.js'
import { losesData } from './loss.js'
import { BACKUPS, BASELINE, CHOICES, DIVERGENCE, PAGE, RESULT, UNFIT } from './messages.js'
import { outcomeOf } from './outcome.js'
import { Previews } from './previews.js'
import { problemReason } from './problem.js'
import { Rehearsal } from './rehearsal.js'
import { RunResult } from './run-result.js'
import { useMigrationRun } from './run.js'
import { Steps } from './steps.js'
import { useCheckText, useStepLines } from './text.js'

/** The plan as the API returns it, kept while its steps are run. */
type Plan = Awaited<ReturnType<ReturnType<typeof usePostMigratePlan>['mutateAsync']>>

/** How the rehearsal of a plan went. */
type RehearsalResult = Awaited<ReturnType<ReturnType<typeof usePostMigrateRehearse>['mutateAsync']>>

/** The word typed to run a migration that loses data. */
const CONFIRM_WORD = 'migrate'

type Decision = {
  readonly kind: string
  readonly modelName: string
  readonly field: string
  readonly choice: string
  readonly value: string | null
}

/** What a decision answers, as a check names itself and a decision names what it answers. */
function keyOf(item: {
  readonly kind: string
  readonly modelName: string
  readonly field: string
}) {
  return `${item.kind}:${item.modelName}.${item.field}`
}

type Decisions = Readonly<Record<string, Decision>>
type Check = Plan['checks'][number]
type Step = Plan['steps'][number]
type Unfit = Plan['unfit'][number]
type Run = ReturnType<typeof useMigrationRun>
type Failures = ReturnType<typeof useFailure>
type StatusData = InferResponseType<typeof migrateClient.migrate.$get, 200>
type KeptData = InferResponseType<typeof migrateClient.migrate.decisions.$get, 200>
type PageText = (typeof PAGE)['ja']
type BackupText = (typeof BACKUPS)['ja']

/** A decision as the API takes it: a value the choice does not need is left out. */
function apiDecision(decision: Decision) {
  return {
    kind: decision.kind,
    modelName: decision.modelName,
    field: decision.field,
    choice: decision.choice,
    ...(decision.value === null ? {} : { value: decision.value }),
  }
}

/** The decisions as the API takes them. */
function decisionList(made: Decisions) {
  return Object.values(made).map(apiDecision)
}

/** The decisions kept in the project, by what each answers. */
function keptDecisions(kept: KeptData | undefined): Decisions {
  return Object.fromEntries(
    (kept?.decisions ?? []).map((decision) => [
      keyOf(decision),
      { ...decision, value: decision.value ?? null },
    ]),
  )
}

/** The kept decisions without those named. */
function withoutKeys(decisions: Decisions, keys: ReadonlySet<string>): Decisions {
  return Object.fromEntries(Object.entries(decisions).filter(([key]) => !keys.has(key)))
}

/** A check that stops the migration until something is done about it. */
function isBlocking(check: { readonly status: string }) {
  return check.status === 'blocking' || check.status === 'failed'
}

/**
 * What needs a decision: what blocks, what a suggestion would keep from being lost, and what has
 * been decided already.
 */
function needsDecision(check: Check, decisions: Decisions) {
  return (
    isBlocking(check) ||
    (check.status === 'warning' && check.suggestion !== null) ||
    // A column dropped is a question of where its values go, answered or not.
    (check.status === 'warning' && check.kind === 'column-dropped') ||
    decisions[keyOf(check)] !== undefined
  )
}

/** The field a suggested rename or move of a dropped column fills. */
function renamedInto(check: Check): readonly string[] {
  if (check.kind !== 'column-dropped' || check.suggestion === null) return []
  if (check.suggestion.choice === 'rename') {
    return [`${check.modelName}.${check.suggestion.value ?? ''}`]
  }
  return check.suggestion.choice === 'move' ? [check.suggestion.value ?? ''] : []
}

/**
 * Whether taking every suggestion takes this one. A field a suggested rename fills is not filled
 * as well: the rename brings its values, and a fill on top of it would be a statement that
 * changes nothing.
 */
function isTakenSuggestion(check: Check, renamed: ReadonlySet<string>) {
  return (
    check.suggestion !== null &&
    !(
      (check.kind === 'column-added' || check.kind === 'not-null') &&
      renamed.has(`${check.modelName}.${check.field}`)
    )
  )
}

/** The checks and decisions the decide section lists, and what the summary says of the rest. */
function decisionsView(plan: Plan, decisions: Decisions) {
  const toDecide = plan.checks.filter((check) => needsDecision(check, decisions))
  const answered = new Set(toDecide.map(keyOf))
  // Decisions the schema has lost the field or model of: the plan was made without them.
  const unfitKeys = new Set(plan.unfit.map(keyOf))
  // A decision whose check has gone is shown on its own.
  const alone = Object.values(decisions).filter(
    (decision) => !answered.has(keyOf(decision)) && !unfitKeys.has(keyOf(decision)),
  )
  // What loses data is said in the summary of what happens to it, with the rows; not twice.
  const cautions = plan.checks.filter(
    (check) => check.status === 'warning' && !answered.has(keyOf(check)) && !losesData(check),
  )
  const undecided = toDecide.filter((check) => decisions[keyOf(check)] === undefined)
  const renamed = new Set(undecided.flatMap(renamedInto))
  const suggestions = undecided.filter((check) => isTakenSuggestion(check, renamed))
  return { toDecide, unfitKeys, alone, cautions, undecided, suggestions }
}

/** The warnings no decision answers, said with the changes. */
function cautionsOf(plan: Plan | null, decisions: Decisions) {
  return plan === null ? [] : decisionsView(plan, decisions).cautions
}

/** The rehearsal of the statements as they stand; one of other statements says nothing of them. */
function rehearsedFor(
  rehearsal: { readonly sql: string; readonly result: RehearsalResult } | null,
  statementsKey: string | null,
) {
  return rehearsal?.sql === statementsKey ? rehearsal.result : null
}

/** A step's statements, as the rehearsal request takes them. */
function statementsOf(step: Step) {
  return [...step.statements]
}

/** Every suggestion of the checks, taken as a decision. */
function suggestedDecisions(checks: readonly Check[]): Decisions {
  return Object.fromEntries(
    checks.flatMap((check) =>
      check.suggestion === null
        ? []
        : [
            [
              keyOf(check),
              {
                kind: check.kind,
                modelName: check.modelName,
                field: check.field,
                choice: check.suggestion.choice,
                value: check.suggestion.value,
              },
            ],
          ],
    ),
  )
}

/** Whether the plan can run, and what stands in its way. */
function runView(plan: Plan | null, outcomes: Run['outcomes'], lossy: boolean, ok: boolean) {
  const steps = plan?.steps ?? []
  const checks = plan?.checks ?? []
  const errors = plan?.errors ?? []
  // A step that failed leaves the database somewhere the plan no longer describes.
  const stale = steps.some((_, index) => outcomeOf(outcomes[index]).failed)
  const blockingLeft = checks.filter(isBlocking).length
  // What the plan cannot do that is not a check waiting for a decision: a migration it cannot
  // rewrite. The plan lists those first, then one error per blocking check.
  const otherErrors = errors.slice(
    0,
    errors.length - checks.filter((check) => check.status === 'blocking').length,
  )
  const runnable = plan !== null && blockingLeft === 0 && otherErrors.length === 0 && !stale
  return { stale, blockingLeft, otherErrors, runnable, canRun: runnable && (!lossy || ok) }
}

/** Whether every step has run and gone through, so the run can be recorded. */
function ranEvery(steps: readonly Step[], outcomes: Run['outcomes']) {
  return (
    steps.length > 0 &&
    steps.every((_, index) => {
      const outcome = outcomeOf(outcomes[index])
      return outcome.ran && !outcome.failed
    })
  )
}

/** Where the backup is taken, which is what restoring it brings back. */
function backupNoteOf(dialect: string | null, tk: BackupText) {
  return dialect === 'postgresql' ? tk.takePostgres : tk.takeNoteSqlite
}

/** What the run is doing, or what keeps it from starting. */
function runStatusOf(
  run: {
    readonly progress: number | null
    readonly steps: number
    readonly blockingLeft: number
    readonly runnable: boolean
    readonly lossy: boolean
    readonly rehearsed: RehearsalResult | null
  },
  t: PageText,
  tk: BackupText,
) {
  if (run.progress !== null) {
    return run.progress === 0 ? tk.taking : t.running(run.progress, run.steps)
  }
  if (run.blockingLeft > 0) return t.blocked
  if (!run.runnable || !run.lossy) return ''
  if (run.rehearsed === null) return t.rehearseFirst
  return run.rehearsed.ok ? '' : t.rehearsalFailedBlock
}

/** The steps a confirmation asks about: every destructive one, or the one about to run. */
function confirmedSteps(confirming: 'all' | number | null, steps: readonly Step[]) {
  if (confirming === 'all') return steps.filter((step) => step.destructive)
  if (confirming === null) return []
  return [steps[confirming]].flatMap((step) => (step === undefined ? [] : [step]))
}

/** What the confirmation says of the backup: taken, about to be, or none. */
function confirmBackupOf(
  backup: { readonly name: string } | null,
  backupWanted: boolean,
  canBackup: boolean,
  dialect: string | null,
  t: PageText,
  tk: BackupText,
) {
  if (backup !== null) return tk.taken(backup.name)
  if (backupWanted && canBackup) return `${tk.take}: ${backupNoteOf(dialect, tk)}`
  return t.noBackup
}

/** One numbered part of the page, with whether it is done. */
function Section({
  number,
  title,
  description,
  done,
  children,
}: {
  readonly number: number
  readonly title: string
  readonly description: string
  readonly done: boolean
  readonly children: React.ReactNode
}) {
  return (
    <section className="flex gap-3">
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-body font-semibold ${done ? 'bg-ok/15 text-ok' : 'bg-accent-soft text-accent-text'}`}
      >
        {done ? <LuCircleCheck size={15} /> : number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div>
          <h2 className="text-lead font-semibold">{title}</h2>
          <p className="text-body text-muted">{description}</p>
        </div>
        {children}
      </div>
    </section>
  )
}

/** The mutations of the page, each saying how it went, and whether any of them is under way. */
function useMigrateActions({
  failures,
  run,
  onPlanned,
}: {
  readonly failures: Failures
  readonly run: Run
  readonly onPlanned: (plan: Plan) => void
}) {
  const t = useMessages(PAGE)
  const tb = useMessages(BASELINE)
  const tk = useMessages(BACKUPS)
  const queries = useQueryClient()
  const { setFailure, fail } = failures
  const invalidate = async () => {
    await queries.invalidateQueries({ queryKey: getMigrateQueryKey() })
  }
  const planning = usePostMigratePlan({
    mutation: {
      onSuccess: (made) => {
        onPlanned(made)
        run.clearOutcomes()
      },
      onError: (error) => {
        fail('planFailed', error)
      },
    },
  })
  const keeping = usePutMigrateDecisions({
    mutation: {
      onSuccess: async () => {
        await queries.invalidateQueries({ queryKey: getMigrateDecisionsQueryKey() })
      },
      onError: (error) => {
        fail('keepFailed', error)
      },
    },
  })
  const resolving = usePostMigrateMigrationsRolledBack({
    mutation: {
      onSuccess: async () => {
        await invalidate()
        toast.success(t.rolledBack)
      },
      onError: (error) => {
        fail('recordFailed', error)
      },
    },
  })
  const baselining = usePostMigrateBaseline({
    mutation: {
      onSuccess: async (_, request) => {
        await invalidate()
        await queries.invalidateQueries({ queryKey: getMigrateBaselineQueryKey() })
        toast.success(tb.recorded(request.json.name))
      },
      onError: (error) => {
        fail('baselineFailed', error)
      },
    },
  })
  const rehearsing = usePostMigrateRehearse({
    mutation: {
      onError: (error) => {
        fail('rehearseFailed', error)
      },
    },
  })
  const restoring = usePostMigrateBackupsRestore({
    mutation: {
      onSuccess: async (_, request) => {
        run.forget()
        setFailure(null)
        await invalidate()
        await queries.invalidateQueries({ queryKey: getMigrateBackupsQueryKey() })
        toast.success(tk.restored(request.json.name))
      },
      onError: (error) => {
        fail('restoreFailed', error)
      },
    },
  })
  const deploying = usePostMigrateDeploy({
    mutation: {
      onSuccess: async (deployed) => {
        await invalidate()
        toast.success(t.applied(deployed.applied))
      },
      onError: (error) => {
        fail('deployFailed', error)
      },
    },
  })
  const busy =
    run.pending ||
    resolving.isPending ||
    keeping.isPending ||
    deploying.isPending ||
    baselining.isPending ||
    rehearsing.isPending ||
    restoring.isPending
  return { planning, keeping, resolving, baselining, rehearsing, restoring, deploying, busy }
}

function DriftPill({ status }: { readonly status: StatusData | undefined }) {
  const t = useMessages(PAGE)
  if (status === undefined) return null
  if (status.drift) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-code whitespace-nowrap text-accent-text">
        <LuTriangleAlert size={13} />
        {t.drift}
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-0.5 text-code whitespace-nowrap text-ok">
      <LuCircleCheck size={13} />
      {t.inStep}
    </span>
  )
}

function PageHeader({ status }: { readonly status: StatusData | undefined }) {
  const t = useMessages(PAGE)
  const language = useLanguageStore((s) => s.language)
  const toggleLanguage = useLanguageStore((s) => s.toggle)
  return (
    <header className="flex items-center gap-3">
      <h1 className="shrink-0 text-title font-bold tracking-tight">{t.title}</h1>
      <DriftPill status={status} />
      <span className="ml-auto min-w-0 truncate font-mono text-code text-muted">
        {status?.migrationsDir}
      </span>
      <Button
        className="shrink-0"
        size="sm"
        variant="outline"
        aria-label={language === 'ja' ? t.toEnglish : t.toJapanese}
        onPress={toggleLanguage}
      >
        <LuLanguages size={14} />
        {language === 'ja' ? 'English' : '日本語'}
      </Button>
    </header>
  )
}

/** The history, and what can be done about it: a baseline, a deploy, a divergence, a backup. */
function HistorySection({
  state,
  busy,
  canBackup,
  onResolve,
  onBaseline,
  onDeploy,
  onRestore,
}: {
  readonly state: StatusData
  readonly busy: boolean
  readonly canBackup: boolean
  readonly onResolve: (name: string) => void
  readonly onBaseline: (name: string) => void
  readonly onDeploy: () => void
  readonly onRestore: (backup: string) => void
}) {
  const t = useMessages(PAGE)
  // How the two histories differ, said in words rather than by the engine's name for it.
  const divergences: Readonly<Record<string, string | undefined>> = useMessages(DIVERGENCE)
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h2 className="text-lead font-semibold">{t.historyTitle}</h2>
        <p className="text-body text-muted">{t.historyDescription}</p>
      </div>
      <History status={state} resolving={busy} onResolve={onResolve} />
      {state.baselineNeeded ? <Baseline busy={busy} onRecord={onBaseline} /> : null}
      {state.pending.length > 0 && !state.baselineNeeded ? (
        <div className="flex items-center gap-3">
          <Button variant="primary" isDisabled={busy} onPress={onDeploy}>
            <LuRocket size={14} />
            {t.deploy(state.pending.length)}
          </Button>
          <span className="text-body text-muted">{t.deployNote}</span>
        </div>
      ) : null}
      {state.divergence === null ? null : (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-body text-danger">
          {t.diverged(divergences[state.divergence] ?? state.divergence)}
        </p>
      )}
      {canBackup ? <Backups busy={busy} onRestore={onRestore} /> : null}
    </section>
  )
}

/** What the schema changes, said in sentences, with the warnings no decision answers. */
function ChangesSection({
  plan,
  cautions,
  busy,
  planning,
  onReplan,
}: {
  readonly plan: Plan | null
  readonly cautions: readonly Check[]
  readonly busy: boolean
  readonly planning: boolean
  readonly onReplan: () => void
}) {
  const t = useMessages(PAGE)
  const describeCheck = useCheckText()
  const stepLines = useStepLines()
  const lines = (plan?.steps ?? []).filter((step) => step.kind === 'migration').flatMap(stepLines)
  return (
    <Section
      number={1}
      title={t.changesTitle}
      description={t.changesDescription}
      done={plan !== null}
    >
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" isDisabled={busy || planning} onPress={onReplan}>
          <LuRefreshCw size={13} />
          {t.planAgain}
        </Button>
        {planning ? <span className="text-muted">{t.planning}</span> : null}
      </div>
      {plan === null ? null : (
        <>
          <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-body">
            {lines.length === 0 ? (
              <li className="text-muted">{t.noSchemaChanges}</li>
            ) : (
              lines.map((line) => <li key={line}>{line}</li>)
            )}
          </ul>
          {cautions.length === 0 ? null : (
            <div className="flex flex-col gap-1 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2">
              <span className="flex items-center gap-1.5 text-body font-semibold text-accent-text">
                <LuTriangleAlert size={14} />
                {t.cautions}
              </span>
              <ul className="m-0 list-disc pl-5 text-body">
                {cautions.map((check) => (
                  <li key={`${check.subject}-${check.what}`}>{describeCheck(check)}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Section>
  )
}

/** A kept decision as the unfit list repeats it: the choice, and what was written for it. */
function unfitLabel(decision: Unfit, labels: Readonly<Record<string, string | undefined>>) {
  const label = labels[decision.choice] ?? decision.choice
  return decision.value === null || decision.value === '' ? label : `${label} · ${decision.value}`
}

/** The decisions the schema has lost the field or model of, each to remove. */
function UnfitDecisions({
  unfit,
  unfitKeys,
  decisions,
  busy,
  onDecide,
}: {
  readonly unfit: readonly Unfit[]
  readonly unfitKeys: ReadonlySet<string>
  readonly decisions: Decisions
  readonly busy: boolean
  readonly onDecide: (made: Decisions) => void
}) {
  const tu = useMessages(UNFIT)
  const choiceLabels: Readonly<Record<string, string | undefined>> = useMessages(CHOICES)
  if (unfit.length === 0) return null
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <LuTriangleAlert className="text-danger" size={15} />
        <span className="font-semibold text-danger">{tu.title}</span>
        <Button
          className="ml-auto"
          size="sm"
          variant="danger"
          isDisabled={busy}
          onPress={() => {
            onDecide(withoutKeys(decisions, unfitKeys))
          }}
        >
          <LuTrash2 size={13} />
          {tu.removeAll}
        </Button>
      </div>
      <p className="m-0 text-body text-ink">{tu.explain}</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {unfit.map((decision) => (
          <li
            key={keyOf(decision)}
            className="flex flex-wrap items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>
                {tu.decision(
                  `${decision.modelName}.${decision.field}`,
                  unfitLabel(decision, choiceLabels),
                )}
              </span>
              {decision.reasons.map((reason) => (
                <span key={reason} className="font-mono text-code text-muted">
                  {reason}
                </span>
              ))}
            </span>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={busy}
              onPress={() => {
                onDecide(withoutKeys(decisions, new Set([keyOf(decision)])))
              }}
            >
              <LuTrash2 size={13} />
              {tu.remove}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A card per thing to decide, then the decisions whose check has gone. */
function DecisionCards({
  plan,
  view,
  decisions,
  keptFile,
  busy,
  onDecide,
}: {
  readonly plan: Plan
  readonly view: ReturnType<typeof decisionsView>
  readonly decisions: Decisions
  readonly keptFile: string | undefined
  readonly busy: boolean
  readonly onDecide: (made: Decisions) => void
}) {
  const t = useMessages(PAGE)
  const { toDecide, alone, undecided, suggestions } = view
  if (toDecide.length + alone.length === 0) return null
  // The statements each check's fix runs before the schema changes, in the order of the steps.
  const fixes = Map.groupBy(
    plan.steps.filter((step) => step.kind === 'fix'),
    (step) => step.subject,
  )
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body font-semibold">
          {t.toDecide(undecided.length, toDecide.length + alone.length)}
        </span>
        {suggestions.length === 0 ? null : (
          <Button
            size="sm"
            variant="primary"
            isDisabled={busy}
            onPress={() => {
              onDecide({ ...decisions, ...suggestedDecisions(suggestions) })
            }}
          >
            <LuSparkles size={13} />
            {t.takeAll}
          </Button>
        )}
        <span className="ml-auto truncate text-code text-muted">
          {t.keptIn} <span className="font-mono">{keptFile}</span>
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {toDecide.map((check) => (
          <CheckCard
            key={`${keyOf(check)}:${decisions[keyOf(check)]?.choice ?? ''}:${check.suggestion?.choice ?? ''}`}
            check={check}
            decision={decisions[keyOf(check)] ?? null}
            statements={(fixes.get(check.subject) ?? []).flatMap((step) => step.statements)}
            busy={busy}
            onDecide={(choice, value) => {
              onDecide({
                ...decisions,
                [keyOf(check)]: {
                  kind: check.kind,
                  modelName: check.modelName,
                  field: check.field,
                  choice,
                  value,
                },
              })
            }}
            onUndo={() => {
              onDecide(withoutKeys(decisions, new Set([keyOf(check)])))
            }}
          />
        ))}
        {alone.map((decision) => (
          <CheckCard
            key={keyOf(decision)}
            check={null}
            decision={decision}
            statements={[]}
            busy={busy}
            onDecide={(choice, value) => {
              onDecide({ ...decisions, [keyOf(decision)]: { ...decision, choice, value } })
            }}
            onUndo={() => {
              onDecide(withoutKeys(decisions, new Set([keyOf(decision)])))
            }}
          />
        ))}
      </ul>
    </>
  )
}

/** Everything the steps do, read before anything runs. */
function ReviewSection({
  plan,
  outcomes,
  done,
}: {
  readonly plan: Plan
  readonly outcomes: Run['outcomes']
  readonly done: boolean
}) {
  const t = useMessages(PAGE)
  const destructive = plan.steps.filter((step) => step.destructive)
  return (
    <Section
      number={3}
      title={t.reviewTitle}
      description={plan.previews.length === 0 ? t.nothingToPreview : t.reviewDescription}
      done={done}
    >
      <Impact checks={plan.checks} steps={plan.steps} />
      <Previews previews={plan.previews} />
      {destructive.length === 0 ? null : (
        <p className="flex items-center gap-1.5 text-body text-danger">
          <LuTriangleAlert size={14} />
          {t.losesData(destructive.length)}
        </p>
      )}
      <Steps plan={plan} outcomes={outcomes} running onRun={null} />
      <details className="rounded-lg border border-line bg-surface px-3 py-2">
        <summary className="cursor-pointer font-semibold">{t.fullSql}</summary>
        <p className="my-1.5 text-code text-muted">{t.fullSqlNote}</p>
        <CodeBlock
          code={plan.steps.flatMap((step) => step.statements.map((sql) => `${sql};`)).join('\n')}
          language="sql"
        />
      </details>
    </Section>
  )
}

/** Whether a backup is taken before a run that loses data, and where. */
function BackupChoice({ run, dialect }: { readonly run: Run; readonly dialect: string | null }) {
  const t = useMessages(PAGE)
  const tk = useMessages(BACKUPS)
  return (
    <label className="flex items-start gap-2 text-body" aria-label={tk.take}>
      <input
        className="mt-1"
        type="checkbox"
        checked={run.backupWanted}
        onChange={(event) => {
          run.setBackupWanted(event.target.checked)
        }}
      />
      <span className="flex flex-col">
        <span className="font-semibold">{tk.take}</span>
        <span className="text-code text-muted">
          {run.backupWanted ? backupNoteOf(dialect, tk) : t.noBackup}
        </span>
      </span>
    </label>
  )
}

/** The steps run one at a time, and the run recorded once every one went through. */
function StepwiseRun({
  plan,
  run,
  busy,
  canRun,
  stale,
  onConfirm,
}: {
  readonly plan: Plan
  readonly run: Run
  readonly busy: boolean
  readonly canRun: boolean
  readonly stale: boolean
  readonly onConfirm: (what: number) => void
}) {
  const t = useMessages(PAGE)
  const every = ranEvery(plan.steps, run.outcomes)
  return (
    <>
      <Steps
        plan={plan}
        outcomes={run.outcomes}
        running={busy || !canRun}
        onRun={(index) => {
          if (plan.steps[index]?.destructive ?? false) onConfirm(index)
          else void run.runOne(index)
        }}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          isDisabled={busy || !every || stale}
          onPress={() => {
            void run.recordStepwise()
          }}
        >
          <LuCircleCheck size={14} />
          {t.record}
        </Button>
        <span className="text-body text-muted">{every ? t.recordNote : t.recordFirst}</span>
      </div>
    </>
  )
}

type RunSectionProps = {
  readonly plan: Plan
  readonly run: Run
  readonly view: ReturnType<typeof runView>
  readonly busy: boolean
  readonly planning: boolean
  readonly rehearsed: RehearsalResult | null
  readonly canBackup: boolean
  readonly dialect: string | null
  readonly name: string
  readonly onName: (name: string) => void
  readonly batch: string
  readonly onBatch: (batch: string) => void
  readonly stepwise: boolean
  readonly onStepwise: () => void
  readonly onReplan: () => void
  readonly onConfirm: (what: 'all' | number) => void
}

/** The run: what stands in its way, the name and batch of the migration, and Run. */
function RunSection({
  plan,
  run,
  view,
  busy,
  planning,
  rehearsed,
  canBackup,
  dialect,
  name,
  onName,
  batch,
  onBatch,
  stepwise,
  onStepwise,
  onReplan,
  onConfirm,
}: RunSectionProps) {
  const t = useMessages(PAGE)
  const tk = useMessages(BACKUPS)
  const { stale, otherErrors, canRun } = view
  return (
    <Section number={5} title={t.runTitle} description={t.runDescription} done={false}>
      {otherErrors.map((problem) => (
        <p
          key={problem}
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-body text-danger"
        >
          {problem}
        </p>
      ))}
      {stale ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-body text-danger">
          {t.stale}
        </p>
      ) : null}
      {run.lossy && canBackup ? <BackupChoice run={run} dialect={dialect} /> : null}
      <div className="flex flex-wrap items-end gap-3">
        <TextField className="max-w-64" value={name} onChange={onName}>
          <Label>{t.name}</Label>
          <Input placeholder="profile" />
        </TextField>
        <TextField
          className="max-w-40"
          value={batch}
          onChange={(next) => {
            onBatch(next.replaceAll(/\D/gu, ''))
          }}
          onBlur={() => {
            if (!busy) onReplan()
          }}
        >
          <Label>{t.batch}</Label>
          <Input inputMode="numeric" placeholder="10000" title={t.batchHint} />
        </TextField>
        <Button
          variant="primary"
          isDisabled={busy || planning || !canRun}
          onPress={() => {
            if (run.lossy) onConfirm('all')
            else void run.runAll()
          }}
        >
          <LuPlay size={14} />
          {t.runAll}
        </Button>
        <span className="text-body text-muted">
          {runStatusOf(
            {
              progress: run.progress,
              steps: plan.steps.length,
              blockingLeft: view.blockingLeft,
              runnable: view.runnable,
              lossy: run.lossy,
              rehearsed,
            },
            t,
            tk,
          )}
        </span>
      </div>
      <button
        type="button"
        className="flex items-center gap-1 self-start text-body text-muted"
        onClick={onStepwise}
      >
        {stepwise ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
        {t.oneByOne}
      </button>
      {stepwise ? (
        <StepwiseRun
          plan={plan}
          run={run}
          busy={busy}
          canRun={canRun}
          stale={stale}
          onConfirm={onConfirm}
        />
      ) : null}
    </Section>
  )
}

type PlanSectionsProps = Omit<RunSectionProps, 'view'> & {
  readonly decisions: Decisions
  readonly keptFile: string | undefined
  readonly rehearsing: boolean
  readonly onDecide: (made: Decisions) => void
  readonly onRehearse: () => void
}

/** Sections two to five: decide, review, rehearse and run, once there is a plan. */
function PlanSections(props: PlanSectionsProps) {
  const t = useMessages(PAGE)
  const { plan, run, busy, planning, decisions, rehearsed } = props
  const view = decisionsView(plan, decisions)
  const ran = runView(plan, run.outcomes, run.lossy, rehearsed?.ok === true)
  const { toDecide, alone, unfitKeys } = view
  return (
    <>
      <Section
        number={2}
        title={t.decideTitle}
        description={toDecide.length + alone.length === 0 ? t.nothingToDecide : t.decideDescription}
        done={ran.blockingLeft === 0 && plan.unfit.length === 0}
      >
        <UnfitDecisions
          unfit={plan.unfit}
          unfitKeys={unfitKeys}
          decisions={decisions}
          busy={busy || planning}
          onDecide={props.onDecide}
        />
        <DecisionCards
          plan={plan}
          view={view}
          decisions={decisions}
          keptFile={props.keptFile}
          busy={busy || planning}
          onDecide={props.onDecide}
        />
      </Section>
      <ReviewSection plan={plan} outcomes={run.outcomes} done={ran.blockingLeft === 0} />
      <Section
        number={4}
        title={t.rehearseTitle}
        description={t.rehearseDescription}
        done={rehearsed?.ok === true}
      >
        <Rehearsal
          dialect={props.dialect}
          result={rehearsed}
          required={run.lossy}
          pending={props.rehearsing}
          disabled={busy || planning || !ran.runnable}
          onRehearse={props.onRehearse}
        />
      </Section>
      <RunSection {...props} view={ran} />
    </>
  )
}

/** The plan once the history allows one: nothing to do, a baseline to record first, or the sections. */
function Workflow({
  state,
  ...props
}: Omit<PlanSectionsProps, 'plan'> & {
  readonly state: StatusData
  readonly plan: Plan | null
  readonly cautions: readonly Check[]
}) {
  const t = useMessages(PAGE)
  const tb = useMessages(BASELINE)
  if (state.baselineNeeded) {
    return (
      <p className="rounded-lg border border-line bg-surface px-3 py-6 text-center text-muted">
        {tb.blocked}
      </p>
    )
  }
  if (!state.drift) {
    return (
      <p className="rounded-lg border border-line bg-surface px-3 py-6 text-center text-muted">
        {t.upToDate}
      </p>
    )
  }
  const { plan } = props
  return (
    <>
      <ChangesSection
        plan={plan}
        cautions={props.cautions}
        busy={props.busy}
        planning={props.planning}
        onReplan={props.onReplan}
      />
      {plan === null ? null : <PlanSections {...props} plan={plan} />}
    </>
  )
}

/** Asks before a run that loses data, with what it loses and the backup, and the word typed. */
function ConfirmRun({
  confirming,
  plan,
  run,
  busy,
  canBackup,
  dialect,
  typed,
  onTyped,
  onConfirm,
  onClose,
}: {
  readonly confirming: 'all' | number | null
  readonly plan: Plan | null
  readonly run: Run
  readonly busy: boolean
  readonly canBackup: boolean
  readonly dialect: string | null
  readonly typed: string
  readonly onTyped: (typed: string) => void
  readonly onConfirm: () => void
  readonly onClose: () => void
}) {
  const t = useMessages(PAGE)
  const tk = useMessages(BACKUPS)
  const tf = useMessages(RESULT)
  const describeCheck = useCheckText()
  const stepLines = useStepLines()
  const losses = (plan?.checks ?? []).filter(losesData)
  return (
    <ConfirmDialog
      isOpen={confirming !== null}
      title={t.confirmTitle}
      detail={
        <div className="flex flex-col gap-2">
          <ul className="m-0 list-disc pl-5 text-body">
            {confirmedSteps(confirming, plan?.steps ?? [])
              .flatMap(stepLines)
              .map((line) => (
                <li key={line}>{line}</li>
              ))}
          </ul>
          {losses.length === 0 ? null : (
            <ul className="m-0 list-disc pl-5 text-body text-danger">
              {losses.map((check) => (
                <li key={`${check.kind}:${check.subject}`}>{describeCheck(check)}</li>
              ))}
            </ul>
          )}
          <span className="text-muted">{t.confirmNote}</span>
          <span className="text-body">
            {confirmBackupOf(
              run.prepared?.backup ?? null,
              run.backupWanted,
              canBackup,
              dialect,
              t,
              tk,
            )}
          </span>
          <TextField value={typed} onChange={onTyped} aria-label={tf.confirmType(CONFIRM_WORD)}>
            <Label>{tf.confirmType(CONFIRM_WORD)}</Label>
            <Input placeholder={CONFIRM_WORD} autoComplete="off" />
          </TextField>
        </div>
      }
      confirmLabel={t.confirmRun}
      isPending={busy || typed.trim() !== CONFIRM_WORD}
      onConfirm={onConfirm}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    />
  )
}

/** Says the history is being read, or why it could not be. */
function StatusProblem({ pending, error }: { readonly pending: boolean; readonly error: unknown }) {
  const t = useMessages(PAGE)
  if (pending) return <p className="text-muted">{t.loading}</p>
  return (
    <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 whitespace-pre-line text-danger">
      {problemReason(error) ?? t.unreadable}
    </p>
  )
}

/**
 * Migrations from the browser, in the order a person works through one: what the schema changes,
 * what becomes of the rows that do not fit (each with a suggestion read from the schema), the
 * rows as the decisions leave them, and the run, which writes the migration and records it.
 */
export function MigrateView() {
  const dialect = useDb().data?.dialect ?? null
  // A database Prisma Migrate cannot read this way is refused, and refused again on every retry.
  const status = useMigrate({ query: { retry: false } })
  const kept = useMigrateDecisions()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [name, setName] = useState('')
  // Empty for every fix in one statement; the plan is made again when it changes.
  const [batch, setBatch] = useState('')
  const [confirming, setConfirming] = useState<'all' | number | null>(null)
  const [stepwise, setStepwise] = useState(false)
  // The rehearsal belongs to the SQL it was made for: a plan whose statements changed (a decision,
  // the schema saved) has to be rehearsed again, and one compared again to the same statements
  // does not.
  const [rehearsal, setRehearsal] = useState<{
    readonly sql: string
    readonly result: RehearsalResult
  } | null>(null)
  const [typed, setTyped] = useState('')
  const language = useLanguageStore((s) => s.language)
  const failures = useFailure()
  const { failure, setFailure } = failures
  const canBackup = dialect === 'sqlite' || dialect === 'postgresql'
  const run = useMigrationRun({
    plan,
    name,
    canBackup,
    failures,
    onRecorded: () => {
      setPlan(null)
    },
  })
  const decisions = keptDecisions(kept.data)
  const actions = useMigrateActions({ failures, run, onPlanned: setPlan })
  const { planning, busy, restoring } = actions

  const replan = (made: Decisions) => {
    const rows = Number.parseInt(batch, 10)
    planning.mutate({
      json: {
        ...(name === '' ? {} : { name }),
        decisions: decisionList(made),
        ...(Number.isInteger(rows) && rows > 0 ? { batch: rows } : {}),
      },
    })
  }
  /** Keeps every decision as they now stand, and compares again with them. */
  const decide = (made: Decisions) => {
    actions.keeping.mutate({ json: { decisions: decisionList(made) } })
    replan(made)
  }

  // The page opens on the comparison, and compares again whenever the history is read again: after
  // the schema or the migrations directory changed on disk, or a migration was recorded. Nobody
  // should have to ask. A database to baseline is compared with its migrations first; a plan
  // whose steps have started running is kept, since it says how far they got.
  const drift = status.data?.drift === true && !status.data.baselineNeeded
  const ready = kept.isFetched
  const running = run.progress !== null || Object.keys(run.outcomes).length > 0
  useEffect(() => {
    if (!ready || running || planning.isPending) return
    if (drift) replan(decisions)
    else setPlan(null)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- on each reading of the history, not on each render
  }, [status.dataUpdatedAt, ready])

  if (status.isPending || status.error !== null || status.data === undefined) {
    return (
      <div lang={language} className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-6">
        <PageHeader status={status.data} />
        <StatusProblem pending={status.isPending} error={status.error} />
      </div>
    )
  }
  const rehearsed = rehearsedFor(rehearsal, run.statementsKey)
  /** Closes the confirmation, whichever run it asked about. */
  const confirmed = () => {
    setConfirming(null)
    setTyped('')
  }

  return (
    <div lang={language} className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-6">
      <PageHeader status={status.data} />
      {failure === null ? null : (
        <FailureAlert
          failure={failure}
          backup={run.prepared?.backup ?? null}
          busy={busy}
          onRestore={(backup) => {
            restoring.mutate({ json: { name: backup } })
          }}
          onDismiss={() => {
            setFailure(null)
          }}
        />
      )}
      {run.finished === null ? null : (
        <RunResult
          finished={run.finished}
          busy={busy}
          onUndo={(backup) => {
            if (run.finished !== null) {
              restoring.mutate({ json: { name: backup, migration: run.finished.name } })
            }
          }}
          onDismiss={run.dismiss}
        />
      )}
      <HistorySection
        state={status.data}
        busy={busy}
        canBackup={canBackup}
        onResolve={(failed) => {
          actions.resolving.mutate({ json: { name: failed } })
        }}
        onBaseline={(migration) => {
          setFailure(null)
          actions.baselining.mutate({ json: { name: migration } })
        }}
        onDeploy={() => {
          actions.deploying.mutate()
        }}
        onRestore={(backup) => {
          restoring.mutate({ json: { name: backup } })
        }}
      />
      <Workflow
        state={status.data}
        plan={plan}
        cautions={cautionsOf(plan, decisions)}
        run={run}
        busy={busy}
        planning={planning.isPending}
        rehearsing={actions.rehearsing.isPending}
        rehearsed={rehearsed}
        decisions={decisions}
        keptFile={kept.data?.file}
        canBackup={canBackup}
        dialect={dialect}
        name={name}
        onName={setName}
        batch={batch}
        onBatch={setBatch}
        stepwise={stepwise}
        onStepwise={() => {
          setStepwise((current) => !current)
        }}
        onReplan={() => {
          replan(decisions)
        }}
        onDecide={decide}
        onConfirm={setConfirming}
        onRehearse={() => {
          setFailure(null)
          const { statementsKey } = run
          actions.rehearsing.mutate(
            { json: { steps: (plan?.steps ?? []).map(statementsOf) } },
            {
              onSuccess: (result) => {
                if (statementsKey !== null) setRehearsal({ sql: statementsKey, result })
              },
            },
          )
        }}
      />
      <ConfirmRun
        confirming={confirming}
        plan={plan}
        run={run}
        busy={busy}
        canBackup={canBackup}
        dialect={dialect}
        typed={typed}
        onTyped={setTyped}
        onConfirm={() => {
          const chosen = confirming
          confirmed()
          if (chosen === 'all') void run.runAll()
          else if (chosen !== null) void run.runOne(chosen)
        }}
        onClose={confirmed}
      />
    </div>
  )
}
