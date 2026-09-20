import { toast } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { useState } from 'react'

import {
  getMigrateBackupsQueryKey,
  getMigrateQueryKey,
  getMigrateQueryOptions,
  getMigrateTablesQueryOptions,
  usePostMigrateApply,
  usePostMigrateBackups,
  usePostMigrateMigrations,
  usePostMigrateMigrationsApplied,
} from '../../hooks/index.js'
import type { usePostMigratePlan } from '../../hooks/index.js'
import type { client } from '../../lib/index.js'
import type { useFailure } from './failure.js'
import { useMessages } from './language.js'
import { losesData } from './loss.js'
import { BACKUPS, PAGE } from './messages.js'
import type { StepOutcome } from './outcome.js'

/**
 * The run of a plan: its steps, all at once or one at a time, then the migration written and
 * recorded and the result checked. What each step did, how far a run has got, what was prepared
 * before the first step and what the last run did are kept here.
 */
export function useMigrationRun(input: {
  readonly plan: Awaited<ReturnType<ReturnType<typeof usePostMigratePlan>['mutateAsync']>> | null
  /** What to call the migration; `migration` when left empty. */
  readonly name: string
  readonly canBackup: boolean
  readonly failures: ReturnType<typeof useFailure>
  /** The migration is written and recorded: the plan it was made from is done with. */
  readonly onRecorded: () => void
}) {
  const t = useMessages(PAGE)
  const tk = useMessages(BACKUPS)
  const queries = useQueryClient()
  const { fail, setFailure } = input.failures
  const [outcomes, setOutcomes] = useState<Readonly<Record<number, StepOutcome>>>({})
  const [progress, setProgress] = useState<number | null>(null)
  const [backupWanted, setBackupWanted] = useState(true)
  // The counts and the backup belong to the SQL they were made for: a plan whose statements
  // changed (a decision, the schema saved) prepares again, and one planned again to the same
  // statements does not.
  const [prepared, setPrepared] = useState<{
    readonly sql: string
    readonly tables: InferResponseType<typeof client.migrate.tables.$get, 200>['tables'] | null
    readonly backup: { readonly name: string; readonly restorable: boolean } | null
  } | null>(null)
  // What the last run did, checked after it: kept until dismissed, whatever the page compares next.
  const [finished, setFinished] = useState<{
    readonly name: string
    readonly matches: boolean
    readonly tables: readonly {
      readonly table: string
      readonly before: number | null
      readonly after: number | null
    }[]
    readonly backup: { readonly name: string; readonly restorable: boolean } | null
  } | null>(null)
  const applying = usePostMigrateApply()
  const creating = usePostMigrateMigrations()
  const marking = usePostMigrateMigrationsApplied()
  const backingUp = usePostMigrateBackups()

  const steps = input.plan?.steps ?? []
  const statementsKey =
    input.plan === null ? null : JSON.stringify(steps.map((step) => step.statements))
  // A run that loses data is backed up first, and waits for a rehearsal of this very plan.
  const lossy = steps.some((step) => step.destructive) || (input.plan?.checks ?? []).some(losesData)
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
    const wanted = lossy && backupWanted && input.canBackup
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
  const verify = async (recorded: string, before: NonNullable<typeof prepared>) => {
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
    if (input.plan === null) return null
    setFailure(null)
    try {
      const created = await creating.mutateAsync({
        json: {
          name: input.name === '' ? 'migration' : input.name,
          sql: steps.flatMap((step) => step.statements.map((sql) => `${sql};`)).join('\n'),
        },
      })
      // Written but not recorded is its own failure: the file is there, and Prisma does not know it ran.
      try {
        await marking.mutateAsync({ json: { name: created.name } })
      } catch (e) {
        fail('recordFailed', e)
        return null
      }
      input.onRecorded()
      setOutcomes({})
      await queries.invalidateQueries({ queryKey: getMigrateQueryKey() })
      toast.success(t.recorded(created.name))
      return created.name
    } catch (e) {
      fail('writeFailed', e)
      return null
    }
  }

  return {
    /** What each step did, by its index in the plan. */
    outcomes,
    /** The step a run of every step is at, 0 while it prepares; null when none is running. */
    progress,
    /** What was prepared for the plan as it is now; null before its first step. */
    prepared: ownPrepared,
    finished,
    backupWanted,
    setBackupWanted,
    /** Whether the run loses data: a step drops something, or a check says rows are lost. */
    lossy,
    /** The statements of the plan, as what a rehearsal or a preparation was made for. */
    statementsKey,
    pending:
      applying.isPending ||
      creating.isPending ||
      marking.isPending ||
      backingUp.isPending ||
      progress !== null,
    runAll: async () => {
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
    },
    /** Runs one step by itself, the preparation first when it is the first of the plan. */
    runOne: async (index: number) => {
      setFinished(null)
      if ((await prepare()) === null) return
      await runStep(index)
    },
    /** Records the steps run one at a time, and checks the result. */
    recordStepwise: async () => {
      const before = ownPrepared
      const recorded = await record()
      if (recorded !== null && before !== null) await verify(recorded, before)
    },
    /** A new plan starts with no step run. */
    clearOutcomes: () => {
      setOutcomes({})
    },
    dismiss: () => {
      setFinished(null)
    },
    /** The database is back as a backup had it: nothing of the run it was taken for stands. */
    forget: () => {
      setFinished(null)
      setPrepared(null)
      setOutcomes({})
    },
  }
}
