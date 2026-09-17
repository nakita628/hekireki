import { Button, Input, Label, TextField, toast } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { useEffect, useState } from 'react'
import {
  LuArchiveRestore,
  LuChevronDown,
  LuChevronRight,
  LuCircleAlert,
  LuCircleCheck,
  LuLanguages,
  LuPlay,
  LuRefreshCw,
  LuRocket,
  LuSparkles,
  LuTrash2,
  LuTriangleAlert,
  LuX,
} from 'react-icons/lu'

import { CodeBlock } from '../../components/code-block.js'
import { ConfirmDialog } from '../../components/confirm-dialog.js'
import {
  getMigrateBackupsQueryKey,
  getMigrateBaselineQueryKey,
  getMigrateDecisionsQueryKey,
  getMigrateQueryKey,
  getMigrateQueryOptions,
  getMigrateTablesQueryOptions,
  useDb,
  useMigrate,
  useMigrateDecisions,
  usePostMigrateApply,
  usePostMigrateBackups,
  usePostMigrateBackupsRestore,
  usePostMigrateBaseline,
  usePostMigrateDeploy,
  usePostMigrateMigrations,
  usePostMigrateMigrationsApplied,
  usePostMigrateMigrationsRolledBack,
  usePostMigratePlan,
  usePostMigrateRehearse,
  usePutMigrateDecisions,
} from '../../hooks/index.js'
import type { client } from '../../lib/index.js'
import { Backups } from './backups.js'
import { Baseline } from './baseline.js'
import { CheckCard } from './check-card.js'
import { History } from './history.js'
import { Impact } from './impact.js'
import { useLanguageStore, useMessages } from './language.js'
import { losesData } from './loss.js'
import { BACKUPS, BASELINE, CHOICES, DIVERGENCE, PAGE, RESULT, UNFIT } from './messages.js'
import { outcomeOf } from './outcome.js'
import type { StepOutcome } from './outcome.js'
import { Previews } from './previews.js'
import { problemReason } from './problem.js'
import { Rehearsal } from './rehearsal.js'
import { RowCounts } from './row-counts.js'
import { Steps } from './steps.js'
import { useCheckText, useStepLines } from './text.js'

/** The plan as the API returns it, kept while its steps are run. */
type Plan = Awaited<ReturnType<ReturnType<typeof usePostMigratePlan>['mutateAsync']>>

/** How the rehearsal of a plan went. */
type RehearsalResult = Awaited<ReturnType<ReturnType<typeof usePostMigrateRehearse>['mutateAsync']>>

/** Each table's rows as the API counts them now (in `after`). */
type TableCounts = InferResponseType<typeof client.migrate.tables.$get, 200>['tables']

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

/** The decisions as the API takes them: a value a choice does not need is left out. */
function decisionList(made: Readonly<Record<string, Decision>>) {
  return Object.values(made).map((decision) => ({
    kind: decision.kind,
    modelName: decision.modelName,
    field: decision.field,
    choice: decision.choice,
    value: decision.value ?? undefined,
  }))
}

/** A check that stops the migration until something is done about it. */
function isBlocking(check: { readonly status: string }) {
  return check.status === 'blocking' || check.status === 'failed'
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

/**
 * Migrations from the browser, in the order a person works through one: what the schema changes,
 * what becomes of the rows that do not fit (each with a suggestion read from the schema), the
 * rows as the decisions leave them, and the run, which writes the migration and records it.
 */
export function MigrateView() {
  const t = useMessages(PAGE)
  const tb = useMessages(BASELINE)
  const tu = useMessages(UNFIT)
  const tk = useMessages(BACKUPS)
  const tf = useMessages(RESULT)
  const dialect = useDb().data?.dialect ?? null
  // How the two histories differ, said in words rather than by the engine's name for it.
  const divergences: Readonly<Record<string, string | undefined>> = useMessages(DIVERGENCE)
  const choiceLabels: Readonly<Record<string, string | undefined>> = useMessages(CHOICES)
  const describeCheck = useCheckText()
  const stepLines = useStepLines()
  const queries = useQueryClient()
  // A database Prisma Migrate cannot read this way is refused, and refused again on every retry.
  const status = useMigrate({ query: { queryKey: getMigrateQueryKey(), retry: false } })
  const kept = useMigrateDecisions()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [name, setName] = useState('')
  // Empty for every fix in one statement; the plan is made again when it changes.
  const [batch, setBatch] = useState('')
  const [outcomes, setOutcomes] = useState<Readonly<Record<number, StepOutcome>>>({})
  const [progress, setProgress] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<'all' | number | null>(null)
  const [stepwise, setStepwise] = useState(false)
  // The rehearsal, the counts and the backup belong to the SQL they were made for: a plan whose
  // statements changed (a decision, the schema saved) has to be rehearsed again, and one compared
  // again to the same statements does not.
  const [rehearsal, setRehearsal] = useState<{
    readonly sql: string
    readonly result: RehearsalResult
  } | null>(null)
  const [prepared, setPrepared] = useState<{
    readonly sql: string
    readonly tables: TableCounts | null
    readonly backup: { readonly name: string; readonly restorable: boolean } | null
  } | null>(null)
  const [backupWanted, setBackupWanted] = useState(true)
  const [typed, setTyped] = useState('')
  // What the last run did, checked after it: kept until dismissed, whatever the page compares next.
  const [finished, setFinished] = useState<{
    readonly name: string
    /** Null when Studio cannot compare this database with the schema. */
    readonly matches: boolean
    readonly tables: readonly {
      readonly table: string
      readonly before: number | null
      readonly after: number | null
    }[]
    readonly backup: { readonly name: string; readonly restorable: boolean } | null
  } | null>(null)
  // What went wrong last, with the server's own words for why: a toast is gone before a database
  // error can be read, so the reason stays on the page until it is dismissed or the next try.
  // What failed is kept as which message it is, so switching the language says it again in the other.
  const [failure, setFailure] = useState<{
    readonly what:
      | 'planFailed'
      | 'keepFailed'
      | 'deployFailed'
      | 'recordFailed'
      | 'writeFailed'
      | 'stepFailed'
      | 'baselineFailed'
      | 'rehearseFailed'
      | 'backupFailed'
      | 'restoreFailed'
    readonly step: number | null
    readonly reason: string | null
  } | null>(null)
  const language = useLanguageStore((s) => s.language)
  const toggleLanguage = useLanguageStore((s) => s.toggle)
  /** Says a request failed and why, on the page and in a toast. */
  const fail = (
    what:
      | 'planFailed'
      | 'keepFailed'
      | 'deployFailed'
      | 'recordFailed'
      | 'writeFailed'
      | 'stepFailed'
      | 'baselineFailed'
      | 'rehearseFailed'
      | 'backupFailed'
      | 'restoreFailed',
    error: unknown,
  ) => {
    const reason = problemReason(error)
    setFailure({ what, step: null, reason })
    toast.danger(t[what], reason === null ? undefined : { description: reason })
  }
  const decisions: Readonly<Record<string, Decision>> = Object.fromEntries(
    (kept.data?.decisions ?? []).map((decision) => [
      keyOf(decision),
      { ...decision, value: decision.value ?? null },
    ]),
  )

  const invalidate = async () => {
    await queries.invalidateQueries({ queryKey: getMigrateQueryKey() })
  }
  const planning = usePostMigratePlan({
    mutation: {
      onSuccess: (made) => {
        setPlan(made)
        setOutcomes({})
      },
      onError: (error) => {
        fail('planFailed', error)
      },
    },
  })
  const applying = usePostMigrateApply()
  const creating = usePostMigrateMigrations()
  const marking = usePostMigrateMigrationsApplied()
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
  const backingUp = usePostMigrateBackups()
  const restoring = usePostMigrateBackupsRestore({
    mutation: {
      onSuccess: async (_, request) => {
        setFinished(null)
        setPrepared(null)
        setOutcomes({})
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
    applying.isPending ||
    creating.isPending ||
    marking.isPending ||
    resolving.isPending ||
    keeping.isPending ||
    deploying.isPending ||
    baselining.isPending ||
    rehearsing.isPending ||
    backingUp.isPending ||
    restoring.isPending ||
    progress !== null

  const replan = (made: Readonly<Record<string, Decision>>) => {
    const rows = Number.parseInt(batch, 10)
    planning.mutate({
      json: {
        name: name === '' ? undefined : name,
        decisions: decisionList(made),
        batch: Number.isInteger(rows) && rows > 0 ? rows : undefined,
      },
    })
  }
  /** Keeps every decision as they now stand, and compares again with them. */
  const decide = (made: Readonly<Record<string, Decision>>) => {
    keeping.mutate({ json: { decisions: decisionList(made) } })
    replan(made)
  }

  // The page opens on the comparison, and compares again whenever the history is read again: after
  // the schema or the migrations directory changed on disk, or a migration was recorded. Nobody
  // should have to ask. A database to baseline is compared with its migrations first; a plan
  // whose steps have started running is kept, since it says how far they got.
  const drift = status.data?.drift === true && !status.data.baselineNeeded
  const ready = kept.isFetched
  const running = progress !== null || Object.keys(outcomes).length > 0
  useEffect(() => {
    if (!ready || running || planning.isPending) return
    if (drift) replan(decisions)
    else setPlan(null)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- on each reading of the history, not on each render
  }, [status.dataUpdatedAt, ready])

  const header = (
    <header className="flex items-center gap-3">
      <h1 className="shrink-0 text-title font-bold tracking-tight">{t.title}</h1>
      {status.data === undefined ? null : status.data.drift ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-code whitespace-nowrap text-accent-text">
          <LuTriangleAlert size={13} />
          {t.drift}
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-0.5 text-code whitespace-nowrap text-ok">
          <LuCircleCheck size={13} />
          {t.inStep}
        </span>
      )}
      <span className="ml-auto min-w-0 truncate font-mono text-code text-muted">
        {status.data?.migrationsDir}
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

  if (status.isPending || status.error !== null || status.data === undefined) {
    return (
      <div lang={language} className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-6">
        {header}
        {status.isPending ? (
          <p className="text-muted">{t.loading}</p>
        ) : (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 whitespace-pre-line text-danger">
            {problemReason(status.error) ?? t.unreadable}
          </p>
        )}
      </div>
    )
  }
  const state = status.data
  const steps = plan?.steps ?? []
  const checks = plan?.checks ?? []
  // What needs a decision: what blocks, what a suggestion would keep from being lost, and what
  // has been decided already; a decision whose check has gone is shown on its own.
  const toDecide = checks.filter(
    (check) =>
      isBlocking(check) ||
      (check.status === 'warning' && check.suggestion !== null) ||
      // A column dropped is a question of where its values go, answered or not.
      (check.status === 'warning' && check.kind === 'column-dropped') ||
      decisions[keyOf(check)] !== undefined,
  )
  const answered = new Set(toDecide.map(keyOf))
  // Decisions the schema has lost the field or model of: the plan was made without them.
  const unfit = plan?.unfit ?? []
  const unfitKeys = new Set(unfit.map(keyOf))
  const alone = Object.values(decisions).filter(
    (decision) => !answered.has(keyOf(decision)) && !unfitKeys.has(keyOf(decision)),
  )
  /** The kept decisions without those named. */
  const without = (keys: ReadonlySet<string>) =>
    Object.fromEntries(Object.entries(decisions).filter(([key]) => !keys.has(key)))
  // What loses data is said in the summary of what happens to it, with the rows; not twice.
  const cautions = checks.filter(
    (check) => check.status === 'warning' && !answered.has(keyOf(check)) && !losesData(check),
  )
  const undecided = toDecide.filter((check) => decisions[keyOf(check)] === undefined)
  const blockingLeft = checks.filter(isBlocking).length
  // A field a suggested rename fills is not filled as well: the rename brings its values, and a
  // fill on top of it would be a statement that changes nothing.
  const renamedInto = new Set(
    undecided.flatMap((check) =>
      check.kind === 'column-dropped' && check.suggestion?.choice === 'rename'
        ? [`${check.modelName}.${check.suggestion.value ?? ''}`]
        : check.kind === 'column-dropped' && check.suggestion?.choice === 'move'
          ? [check.suggestion.value ?? '']
          : [],
    ),
  )
  const suggestions = undecided.filter(
    (check) =>
      check.suggestion !== null &&
      !(
        (check.kind === 'column-added' || check.kind === 'not-null') &&
        renamedInto.has(`${check.modelName}.${check.field}`)
      ),
  )
  // A step that failed leaves the database somewhere the plan no longer describes.
  const stale = steps.some((_, index) => outcomeOf(outcomes[index]).failed)
  const ranEvery =
    steps.length > 0 &&
    steps.every((_, index) => {
      const outcome = outcomeOf(outcomes[index])
      return outcome.ran && !outcome.failed
    })
  // What the plan cannot do that is not a check waiting for a decision: a migration it cannot rewrite.
  // The plan lists those first, then one error per blocking check.
  const errors = plan?.errors ?? []
  const otherErrors = errors.slice(
    0,
    errors.length - checks.filter((check) => check.status === 'blocking').length,
  )
  const destructive = steps.filter((step) => step.destructive)
  const losses = checks.filter(losesData)
  // A run that loses data waits for a rehearsal of this very plan that went through.
  const lossy = destructive.length > 0 || losses.length > 0
  const statementsKey = plan === null ? null : JSON.stringify(steps.map((step) => step.statements))
  const rehearsed = rehearsal?.sql === statementsKey ? rehearsal.result : null
  const canBackup = dialect === 'sqlite' || dialect === 'postgresql'
  const runnable = plan !== null && blockingLeft === 0 && otherErrors.length === 0 && !stale
  const canRun = runnable && (!lossy || rehearsed?.ok === true)
  const ownPrepared = prepared?.sql === statementsKey ? prepared : null

  /**
   * What is done once before the first step of a plan runs: the rows of every table counted, to
   * set the result against, and, for a run that loses data, a backup. A backup that cannot be
   * taken stops the run before anything has changed.
   */
  const prepare = async () => {
    if (statementsKey === null) return null
    if (ownPrepared !== null) return ownPrepared
    const tables = await queries
      .query(getMigrateTablesQueryOptions())
      .then((counted) => counted.tables)
      .catch(() => null)
    const wanted = lossy && backupWanted && canBackup
    const backup = wanted
      ? await backingUp.mutateAsync().then(
          (taken) => ({ name: taken.name, restorable: taken.restorable }),
          (e: unknown) => {
            fail('backupFailed', e)
            return null
          },
        )
      : null
    if (wanted && backup === null) return null
    if (backup !== null) {
      await queries.invalidateQueries({ queryKey: getMigrateBackupsQueryKey() })
      toast.success(tk.taken(backup.name))
    }
    const made = { sql: statementsKey, tables, backup }
    setPrepared(made)
    return made
  }
  /** The run checked once it is recorded: every table's rows before and after, and the schema. */
  const verify = async (
    recorded: string,
    before: {
      readonly tables: TableCounts | null
      readonly backup: { readonly name: string; readonly restorable: boolean } | null
    },
  ) => {
    const after = await queries
      .query(getMigrateTablesQueryOptions())
      .then((counted) => counted.tables)
      .catch(() => null)
    const history = await queries.query(getMigrateQueryOptions()).catch(() => null)
    const names = [...new Set([...(before.tables ?? []), ...(after ?? [])].map((one) => one.table))]
    setFinished({
      name: recorded,
      matches: history === null ? false : !history.drift,
      tables: names.map((table) => ({
        table,
        before: before.tables?.find((one) => one.table === table)?.after ?? null,
        after: after?.find((one) => one.table === table)?.after ?? null,
      })),
      backup: before.backup,
    })
  }

  /**
   * Runs one step, and keeps what it did. A statement the database refuses is part of the result,
   * not an error of the request: it is said as the reason the step did not go through.
   */
  const runStep = async (index: number) => {
    const step = steps[index]
    if (step === undefined) return false
    setFailure(null)
    try {
      const result = await applying.mutateAsync({ json: { statements: [...step.statements] } })
      const failed = result.results.find((one) => one.error !== null)
      setOutcomes((done) => ({
        ...done,
        [index]: {
          ran: true,
          affected: result.results.reduce((sum, one) => sum + (one.affected ?? 0), 0),
          error: failed?.error ?? null,
        },
      }))
      if (failed !== undefined) {
        setFailure({
          what: 'stepFailed',
          step: index + 1,
          reason: `${failed.error ?? ''}\n\n${failed.sql}`,
        })
      }
      return failed === undefined
    } catch (e) {
      fail('stepFailed', e)
      return false
    }
  }
  /** Writes migration.sql and records it as applied, once every step has run. */
  const record = async () => {
    if (plan === null) return null
    setFailure(null)
    try {
      const created = await creating.mutateAsync({
        json: {
          name: name === '' ? 'migration' : name,
          sql: plan.steps.flatMap((step) => step.statements.map((sql) => `${sql};`)).join('\n'),
        },
      })
      // Written but not recorded is its own failure: the file is there, and Prisma does not know it ran.
      try {
        await marking.mutateAsync({ json: { name: created.name } })
      } catch (e) {
        fail('recordFailed', e)
        return null
      }
      setPlan(null)
      setOutcomes({})
      await invalidate()
      toast.success(t.recorded(created.name))
      return created.name
    } catch (e) {
      fail('writeFailed', e)
      return null
    }
  }
  const runAll = async () => {
    setConfirming(null)
    setTyped('')
    setFinished(null)
    try {
      setProgress(0)
      const before = await prepare()
      if (before === null) return
      for (const [index] of steps.entries()) {
        setProgress(index + 1)
        // oxlint-disable-next-line no-await-in-loop -- each step runs after the one before it has
        if (!(await runStep(index))) return
      }
      const recorded = await record()
      if (recorded !== null) await verify(recorded, before)
    } finally {
      setProgress(null)
    }
  }
  /** Runs one step by itself, the preparation first when it is the first of the plan. */
  const runOne = async (index: number) => {
    setConfirming(null)
    setTyped('')
    setFinished(null)
    if ((await prepare()) === null) return
    await runStep(index)
  }
  /** Records the steps run one at a time, and checks the result. */
  const recordStepwise = async () => {
    const before = ownPrepared
    const recorded = await record()
    if (recorded !== null && before !== null) await verify(recorded, before)
  }

  return (
    <div lang={language} className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-6">
      {header}
      {failure === null ? null : (
        <div
          role="alert"
          className="flex gap-2.5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-danger"
        >
          <LuCircleAlert className="mt-0.5 shrink-0" size={16} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="font-semibold">
              {failure.step === null ? t[failure.what] : t.stepFailedAt(failure.step)}
            </span>
            {failure.reason === null ? null : (
              <div className="flex flex-col gap-0.5">
                <span className="text-code">{t.reason}</span>
                <pre className="m-0 max-h-60 overflow-auto rounded-md bg-surface px-2.5 py-2 font-mono text-code whitespace-pre-wrap text-ink">
                  {failure.reason}
                </pre>
              </div>
            )}
            <span className="text-body text-ink">{t.failureHint}</span>
            {ownPrepared?.backup?.restorable === true &&
            (failure.what === 'stepFailed' || failure.what === 'writeFailed') ? (
              <Button
                className="self-start"
                size="sm"
                variant="secondary"
                isDisabled={busy}
                onPress={() => {
                  if (ownPrepared.backup !== null) {
                    restoring.mutate({ json: { name: ownPrepared.backup.name } })
                  }
                }}
              >
                <LuArchiveRestore size={13} />
                {tk.failureRestore}
              </Button>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={t.dismiss}
            onPress={() => {
              setFailure(null)
            }}
          >
            <LuX size={14} />
          </Button>
        </div>
      )}

      {finished === null ? null : (
        <div
          data-testid="migrate-result"
          className="flex flex-col gap-2.5 rounded-lg border border-ok/40 bg-ok/5 px-3 py-2.5"
        >
          <div className="flex items-center gap-2">
            <LuCircleCheck className="text-ok" size={16} />
            <span className="font-semibold">{tf.title(finished.name)}</span>
            <Button
              className="ml-auto"
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={tf.dismiss}
              onPress={() => {
                setFinished(null)
              }}
            >
              <LuX size={14} />
            </Button>
          </div>
          <span
            className={`flex items-center gap-1.5 text-body ${finished.matches ? 'text-ok' : 'text-danger'}`}
          >
            {finished.matches ? <LuCircleCheck size={14} /> : <LuCircleAlert size={14} />}
            {finished.matches ? tf.matches : tf.differs}
          </span>
          {finished.tables.length === 0 ? null : (
            <div className="flex flex-col gap-1">
              <span className="text-body font-semibold">{tf.rows}</span>
              <RowCounts tables={finished.tables} />
            </div>
          )}
          {finished.backup?.restorable === true ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={busy}
                onPress={() => {
                  if (finished.backup !== null) {
                    restoring.mutate({
                      json: { name: finished.backup.name, migration: finished.name },
                    })
                  }
                }}
              >
                <LuArchiveRestore size={13} />
                {tk.undoRun}
              </Button>
              <span className="text-code text-muted">{tk.undoNote(finished.backup.name)}</span>
            </div>
          ) : finished.backup === null ? null : (
            <span className="text-code text-muted">{tk.taken(finished.backup.name)}</span>
          )}
        </div>
      )}

      <section className="flex flex-col gap-2.5">
        <div>
          <h2 className="text-lead font-semibold">{t.historyTitle}</h2>
          <p className="text-body text-muted">{t.historyDescription}</p>
        </div>
        <History
          status={state}
          resolving={busy}
          onResolve={(failed) => {
            resolving.mutate({ json: { name: failed } })
          }}
        />
        {state.baselineNeeded ? (
          <Baseline
            busy={busy}
            onRecord={(migration) => {
              setFailure(null)
              baselining.mutate({ json: { name: migration } })
            }}
          />
        ) : null}
        {state.pending.length > 0 && !state.baselineNeeded ? (
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              isDisabled={busy}
              onPress={() => {
                deploying.mutate()
              }}
            >
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
        {canBackup ? (
          <Backups
            busy={busy}
            onRestore={(backup) => {
              restoring.mutate({ json: { name: backup } })
            }}
          />
        ) : null}
      </section>

      {state.baselineNeeded ? (
        <p className="rounded-lg border border-line bg-surface px-3 py-6 text-center text-muted">
          {tb.blocked}
        </p>
      ) : !state.drift ? (
        <p className="rounded-lg border border-line bg-surface px-3 py-6 text-center text-muted">
          {t.upToDate}
        </p>
      ) : (
        <>
          <Section
            number={1}
            title={t.changesTitle}
            description={t.changesDescription}
            done={plan !== null}
          >
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={busy || planning.isPending}
                onPress={() => {
                  replan(decisions)
                }}
              >
                <LuRefreshCw size={13} />
                {t.planAgain}
              </Button>
              {planning.isPending ? <span className="text-muted">{t.planning}</span> : null}
            </div>
            {plan === null ? null : (
              <>
                <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-body">
                  {steps.filter((step) => step.kind === 'migration').flatMap(stepLines).length ===
                  0 ? (
                    <li className="text-muted">{t.noSchemaChanges}</li>
                  ) : (
                    steps
                      .filter((step) => step.kind === 'migration')
                      .flatMap(stepLines)
                      .map((line) => <li key={line}>{line}</li>)
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

          {plan === null ? null : (
            <>
              <Section
                number={2}
                title={t.decideTitle}
                description={
                  toDecide.length + alone.length === 0 ? t.nothingToDecide : t.decideDescription
                }
                done={blockingLeft === 0 && unfit.length === 0}
              >
                {unfit.length === 0 ? null : (
                  <div className="flex flex-col gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <LuTriangleAlert className="text-danger" size={15} />
                      <span className="font-semibold text-danger">{tu.title}</span>
                      <Button
                        className="ml-auto"
                        size="sm"
                        variant="danger"
                        isDisabled={busy || planning.isPending}
                        onPress={() => {
                          decide(without(unfitKeys))
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
                                `${choiceLabels[decision.choice] ?? decision.choice}${decision.value === null || decision.value === '' ? '' : ` · ${decision.value}`}`,
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
                            isDisabled={busy || planning.isPending}
                            onPress={() => {
                              decide(without(new Set([keyOf(decision)])))
                            }}
                          >
                            <LuTrash2 size={13} />
                            {tu.remove}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {toDecide.length + alone.length === 0 ? null : (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-body font-semibold">
                        {t.toDecide(undecided.length, toDecide.length + alone.length)}
                      </span>
                      {suggestions.length === 0 ? null : (
                        <Button
                          size="sm"
                          variant="primary"
                          isDisabled={busy || planning.isPending}
                          onPress={() => {
                            decide({
                              ...decisions,
                              ...Object.fromEntries(
                                suggestions.flatMap((check) =>
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
                              ),
                            })
                          }}
                        >
                          <LuSparkles size={13} />
                          {t.takeAll}
                        </Button>
                      )}
                      <span className="ml-auto truncate text-code text-muted">
                        {t.keptIn} <span className="font-mono">{kept.data?.file}</span>
                      </span>
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {toDecide.map((check) => (
                        <CheckCard
                          key={`${keyOf(check)}:${decisions[keyOf(check)]?.choice ?? ''}:${check.suggestion?.choice ?? ''}`}
                          check={check}
                          decision={decisions[keyOf(check)] ?? null}
                          statements={steps
                            .filter((step) => step.kind === 'fix' && step.subject === check.subject)
                            .flatMap((step) => step.statements)}
                          busy={busy || planning.isPending}
                          onDecide={(choice, value) => {
                            decide({
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
                            decide(
                              Object.fromEntries(
                                Object.entries(decisions).filter(([key]) => key !== keyOf(check)),
                              ),
                            )
                          }}
                        />
                      ))}
                      {alone.map((decision) => (
                        <CheckCard
                          key={keyOf(decision)}
                          check={null}
                          decision={decision}
                          statements={[]}
                          busy={busy || planning.isPending}
                          onDecide={(choice, value) => {
                            decide({
                              ...decisions,
                              [keyOf(decision)]: { ...decision, choice, value },
                            })
                          }}
                          onUndo={() => {
                            decide(
                              Object.fromEntries(
                                Object.entries(decisions).filter(
                                  ([key]) => key !== keyOf(decision),
                                ),
                              ),
                            )
                          }}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </Section>

              <Section
                number={3}
                title={t.reviewTitle}
                description={plan.previews.length === 0 ? t.nothingToPreview : t.reviewDescription}
                done={blockingLeft === 0}
              >
                <Impact checks={checks} steps={steps} />
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
                    code={steps
                      .flatMap((step) => step.statements.map((sql) => `${sql};`))
                      .join('\n')}
                    language="sql"
                  />
                </details>
              </Section>

              <Section
                number={4}
                title={t.rehearseTitle}
                description={t.rehearseDescription}
                done={rehearsed?.ok === true}
              >
                <Rehearsal
                  dialect={dialect}
                  result={rehearsed}
                  required={lossy}
                  pending={rehearsing.isPending}
                  disabled={busy || planning.isPending || !runnable}
                  onRehearse={() => {
                    setFailure(null)
                    rehearsing.mutate(
                      { json: { steps: steps.map((step) => [...step.statements]) } },
                      {
                        onSuccess: (result) => {
                          if (statementsKey !== null) setRehearsal({ sql: statementsKey, result })
                        },
                      },
                    )
                  }}
                />
              </Section>

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
                {lossy && canBackup ? (
                  <label className="flex items-start gap-2 text-body" aria-label={tk.take}>
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={backupWanted}
                      onChange={(event) => {
                        setBackupWanted(event.target.checked)
                      }}
                    />
                    <span className="flex flex-col">
                      <span className="font-semibold">{tk.take}</span>
                      <span className="text-code text-muted">
                        {backupWanted
                          ? dialect === 'postgresql'
                            ? tk.takePostgres
                            : tk.takeNoteSqlite
                          : t.noBackup}
                      </span>
                    </span>
                  </label>
                ) : null}
                <div className="flex flex-wrap items-end gap-3">
                  <TextField className="max-w-64" value={name} onChange={setName}>
                    <Label>{t.name}</Label>
                    <Input placeholder="profile" />
                  </TextField>
                  <TextField
                    className="max-w-40"
                    value={batch}
                    onChange={(next) => {
                      setBatch(next.replaceAll(/\D/gu, ''))
                    }}
                    onBlur={() => {
                      if (!busy) replan(decisions)
                    }}
                  >
                    <Label>{t.batch}</Label>
                    <Input inputMode="numeric" placeholder="10000" title={t.batchHint} />
                  </TextField>
                  <Button
                    variant="primary"
                    isDisabled={busy || planning.isPending || !canRun}
                    onPress={() => {
                      if (lossy) setConfirming('all')
                      else void runAll()
                    }}
                  >
                    <LuPlay size={14} />
                    {t.runAll}
                  </Button>
                  <span className="text-body text-muted">
                    {progress !== null
                      ? progress === 0
                        ? tk.taking
                        : t.running(progress, steps.length)
                      : blockingLeft > 0
                        ? t.blocked
                        : runnable && lossy && rehearsed === null
                          ? t.rehearseFirst
                          : runnable && lossy && rehearsed?.ok === false
                            ? t.rehearsalFailedBlock
                            : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1 self-start text-body text-muted"
                  onClick={() => {
                    setStepwise((current) => !current)
                  }}
                >
                  {stepwise ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                  {t.oneByOne}
                </button>
                {stepwise ? (
                  <>
                    <Steps
                      plan={plan}
                      outcomes={outcomes}
                      running={busy || !canRun}
                      onRun={(index) => {
                        if (steps[index]?.destructive ?? false) setConfirming(index)
                        else void runOne(index)
                      }}
                    />
                    <div className="flex items-center gap-3">
                      <Button
                        variant="primary"
                        isDisabled={busy || !ranEvery || stale}
                        onPress={() => {
                          void recordStepwise()
                        }}
                      >
                        <LuCircleCheck size={14} />
                        {t.record}
                      </Button>
                      <span className="text-body text-muted">
                        {ranEvery ? t.recordNote : t.recordFirst}
                      </span>
                    </div>
                  </>
                ) : null}
              </Section>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={confirming !== null}
        title={t.confirmTitle}
        detail={
          <div className="flex flex-col gap-2">
            <ul className="m-0 list-disc pl-5 text-body">
              {(confirming === 'all'
                ? destructive
                : confirming === null
                  ? []
                  : [steps[confirming]].flatMap((step) => (step === undefined ? [] : [step]))
              )
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
              {ownPrepared?.backup
                ? tk.taken(ownPrepared.backup.name)
                : backupWanted && canBackup
                  ? `${tk.take}: ${dialect === 'postgresql' ? tk.takePostgres : tk.takeNoteSqlite}`
                  : t.noBackup}
            </span>
            <TextField value={typed} onChange={setTyped} aria-label={tf.confirmType(CONFIRM_WORD)}>
              <Label>{tf.confirmType(CONFIRM_WORD)}</Label>
              <Input placeholder={CONFIRM_WORD} autoComplete="off" />
            </TextField>
          </div>
        }
        confirmLabel={t.confirmRun}
        isPending={busy || typed.trim() !== CONFIRM_WORD}
        onConfirm={() => {
          if (confirming === 'all') void runAll()
          else if (confirming !== null) void runOne(confirming)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null)
            setTyped('')
          }
        }}
      />
    </div>
  )
}
