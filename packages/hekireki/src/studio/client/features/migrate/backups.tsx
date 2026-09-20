import { Button } from '@heroui/react'
import { useState } from 'react'
import { LuArchive, LuArchiveRestore } from 'react-icons/lu'

import { ConfirmDialog } from '../../components/confirm-dialog.js'
import { useMigrateBackups } from '../../hooks/index.js'
import { useMessages } from './language.js'
import { BACKUPS } from './messages.js'

/** When a backup was taken, read back from its name (`backup_YYYYMMDDhhmmssSSS`, UTC). */
function backupTakenAt(name: string) {
  const digits = /^backup_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/u.exec(name)
  if (digits === null) return null
  const [, year, month, day, hour, minute, second] = digits
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)
}

/** A size in bytes as a person reads it. */
function sizeOf(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * The backups taken before migrations, newest first, each restorable from here when Studio can
 * put it back (SQLite). Restoring asks first, and says it replaces what changed since.
 */
export function Backups({
  busy,
  onRestore,
}: {
  readonly busy: boolean
  readonly onRestore: (name: string) => void
}) {
  const t = useMessages(BACKUPS)
  const backups = useMigrateBackups()
  const [restoring, setRestoring] = useState<string | null>(null)
  const list = backups.data?.backups ?? []
  return (
    <details className="rounded-lg border border-line bg-surface px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
        <LuArchive size={14} />
        {t.title}
        <span className="font-normal text-muted">({list.length})</span>
      </summary>
      {list.length === 0 ? (
        <p className="my-1.5 text-body text-muted">{t.none}</p>
      ) : (
        <ul className="my-1.5 flex list-none flex-col gap-1.5 p-0">
          {list.map((backup) => (
            <li
              key={backup.name}
              className="flex flex-wrap items-center gap-2.5 rounded-md border border-line px-3 py-1.5"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-mono text-body">
                  {backupTakenAt(backup.name)?.toLocaleString() ?? backup.name}
                  {backup.size === null ? '' : ` · ${sizeOf(backup.size)}`}
                </span>
                <span className="truncate font-mono text-code text-muted">{backup.location}</span>
              </span>
              {backup.restorable ? (
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={busy}
                  onPress={() => {
                    setRestoring(backup.name)
                  }}
                >
                  <LuArchiveRestore size={13} />
                  {t.restore}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={restoring !== null}
        title={t.restoreTitle}
        detail={
          <div className="flex flex-col gap-1.5">
            <span className="font-mono">{restoring}</span>
            <span className="text-muted">{t.restoreNote}</span>
          </div>
        }
        confirmLabel={t.restoreRun}
        isPending={busy}
        onConfirm={() => {
          if (restoring !== null) onRestore(restoring)
          setRestoring(null)
        }}
        onOpenChange={(open) => {
          if (!open) setRestoring(null)
        }}
      />
    </details>
  )
}
