import { Button } from '@heroui/react'
import { LuArchiveRestore, LuCircleAlert, LuCircleCheck, LuX } from 'react-icons/lu'

import { useMessages } from './language.js'
import { BACKUPS, RESULT } from './messages.js'
import { RowCounts } from './row-counts.js'
import type { useMigrationRun } from './run.js'

/** The backup taken for the run: the way to undo it while it can still be restored. */
function BackupNote({
  backup,
  busy,
  onUndo,
}: {
  readonly backup: NonNullable<ReturnType<typeof useMigrationRun>['finished']>['backup']
  readonly busy: boolean
  readonly onUndo: (backup: string) => void
}) {
  const tk = useMessages(BACKUPS)
  if (backup === null) return null
  if (!backup.restorable) {
    return <span className="text-code text-muted">{tk.taken(backup.name)}</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button
        size="sm"
        variant="secondary"
        isDisabled={busy}
        onPress={() => {
          onUndo(backup.name)
        }}
      >
        <LuArchiveRestore size={13} />
        {tk.undoRun}
      </Button>
      <span className="text-code text-muted">{tk.undoNote(backup.name)}</span>
    </div>
  )
}

/**
 * What the last run did, checked after it: whether the database now matches the schema, the rows
 * of every table before and after, and the backup taken for it, which can undo the run.
 */
export function RunResult({
  finished,
  busy,
  onUndo,
  onDismiss,
}: {
  readonly finished: NonNullable<ReturnType<typeof useMigrationRun>['finished']>
  readonly busy: boolean
  /** Restores the backup and takes the migration back out of the history. */
  readonly onUndo: (backup: string) => void
  readonly onDismiss: () => void
}) {
  const tf = useMessages(RESULT)
  return (
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
          onPress={onDismiss}
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
      <BackupNote backup={finished.backup} busy={busy} onUndo={onUndo} />
    </div>
  )
}
