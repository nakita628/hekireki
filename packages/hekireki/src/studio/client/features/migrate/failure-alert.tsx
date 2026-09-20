import { Button } from '@heroui/react'
import { LuArchiveRestore, LuCircleAlert, LuX } from 'react-icons/lu'

import type { useFailure } from './failure.js'
import { useMessages } from './language.js'
import { BACKUPS, PAGE } from './messages.js'

/**
 * The failure on the page, until it is dismissed. A step or a write that failed after a backup
 * was taken for this plan offers to put the database back as it was.
 */
export function FailureAlert({
  failure,
  backup,
  busy,
  onRestore,
  onDismiss,
}: {
  readonly failure: NonNullable<ReturnType<typeof useFailure>['failure']>
  /** The backup taken before this plan ran; null when none was. */
  readonly backup: { readonly name: string; readonly restorable: boolean } | null
  readonly busy: boolean
  readonly onRestore: (backup: string) => void
  readonly onDismiss: () => void
}) {
  const t = useMessages(PAGE)
  const tk = useMessages(BACKUPS)
  return (
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
        {backup?.restorable === true &&
        (failure.what === 'stepFailed' || failure.what === 'writeFailed') ? (
          <Button
            className="self-start"
            size="sm"
            variant="secondary"
            isDisabled={busy}
            onPress={() => {
              onRestore(backup.name)
            }}
          >
            <LuArchiveRestore size={13} />
            {tk.failureRestore}
          </Button>
        ) : null}
      </div>
      <Button size="sm" variant="ghost" isIconOnly aria-label={t.dismiss} onPress={onDismiss}>
        <LuX size={14} />
      </Button>
    </div>
  )
}
