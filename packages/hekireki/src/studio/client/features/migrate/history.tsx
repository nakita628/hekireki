import { Button } from '@heroui/react'
import type { InferResponseType } from 'hono/client'
import { Fragment, useState } from 'react'
import {
  LuChevronDown,
  LuChevronRight,
  LuCircleAlert,
  LuCircleCheck,
  LuClock,
  LuFileX,
  LuPencil,
  LuUndo2,
} from 'react-icons/lu'

import { CodeBlock } from '../../components/code-block.js'
import {
  getMigrateMigrationsMigrationNameQueryKey,
  useMigrateMigrationsMigrationName,
} from '../../hooks/index.js'
import type { client } from '../../lib/index.js'
import { useLanguage, useMessages } from './language.js'
import { HISTORY } from './messages.js'
import { problemReason } from './problem.js'

type Status = InferResponseType<typeof client.migrate.$get, 200>

const CELL = 'px-3 py-2 align-middle'

/** The instant as the database recorded it, in the reader's own time zone. */
function when(value: string | null, language: string) {
  if (value === null) return '—'
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? value : at.toLocaleString(language)
}

function Badge({
  tone,
  icon,
  children,
}: {
  readonly tone: 'ok' | 'warn' | 'danger' | 'muted'
  readonly icon: React.ReactNode
  readonly children: React.ReactNode
}) {
  const tones = {
    ok: 'border-ok/30 bg-ok/10 text-ok',
    warn: 'border-accent/30 bg-accent-soft text-accent-text',
    danger: 'border-danger/30 bg-danger/10 text-danger',
    muted: 'border-line bg-canvas text-muted',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-code ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  )
}

/** What one migration runs, read from its migration.sql when it is asked for. */
function MigrationSql({ name }: { readonly name: string }) {
  const t = useMessages(HISTORY)
  const args = { param: { migrationName: name } }
  const file = useMigrateMigrationsMigrationName(args, {
    query: { queryKey: getMigrateMigrationsMigrationNameQueryKey(args), retry: false },
  })
  if (file.isPending) return <p className="m-0 text-code text-muted">{t.readingSql}</p>
  if (file.data === undefined) {
    return (
      <p className="m-0 text-code whitespace-pre-wrap text-danger">
        {problemReason(file.error) ?? t.sqlUnreadable}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-code text-muted">{file.data.file}</span>
      <CodeBlock code={file.data.sql} language="sql" />
    </div>
  )
}

/**
 * The migration history: what the database has run, what the directory holds that it has not,
 * and the two states that need a person — a migration that failed, and one whose file changed
 * after it ran.
 */
export function History({
  status,
  onResolve,
  resolving,
}: {
  readonly status: Status
  /** Records a migration as rolled back, so a failed one stops standing in the way. */
  readonly onResolve: (name: string) => void
  readonly resolving: boolean
}) {
  const t = useMessages(HISTORY)
  const language = useLanguage()
  // The migrations whose SQL is open, read when they are opened.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const missing = new Set(status.missingFiles)
  const rows = [
    ...status.applied.map((migration) => ({
      name: migration.name,
      at: migration.finishedAt ?? migration.startedAt,
      steps: migration.appliedStepsCount,
      state: status.failed.includes(migration.name)
        ? ('failed' as const)
        : status.edited.includes(migration.name)
          ? ('edited' as const)
          : migration.rolledBackAt !== null
            ? ('rolledBack' as const)
            : ('applied' as const),
    })),
    ...status.pending.map((name) => ({
      name,
      at: null,
      steps: 0,
      state: 'pending' as const,
    })),
  ]
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-3 py-6 text-center text-muted">
        {t.empty(status.migrationsDir)}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse overflow-hidden rounded-lg border border-line bg-surface text-body">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className={`${CELL} heading`}>{t.migration}</th>
            <th className={`${CELL} heading`}>{t.state}</th>
            <th className={`${CELL} heading`}>{t.appliedAt}</th>
            <th className={`${CELL} heading text-right`}>{t.steps}</th>
            <th className={`${CELL} heading`}>
              <span className="sr-only">{t.action}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.name}>
              <tr className="border-b border-line last:border-b-0">
                <td className={`${CELL} font-mono`}>{row.name}</td>
                <td className={CELL}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {row.state === 'applied' ? (
                      <Badge tone="ok" icon={<LuCircleCheck size={13} />}>
                        {t.applied}
                      </Badge>
                    ) : row.state === 'pending' ? (
                      <Badge tone="warn" icon={<LuClock size={13} />}>
                        {t.pending}
                      </Badge>
                    ) : row.state === 'edited' ? (
                      <Badge tone="danger" icon={<LuPencil size={13} />}>
                        {t.edited}
                      </Badge>
                    ) : row.state === 'failed' ? (
                      <Badge tone="danger" icon={<LuCircleAlert size={13} />}>
                        {t.failed}
                      </Badge>
                    ) : (
                      <Badge tone="muted" icon={<LuCircleAlert size={13} />}>
                        {t.rolledBack}
                      </Badge>
                    )}
                    {missing.has(row.name) ? (
                      <Badge tone="danger" icon={<LuFileX size={13} />}>
                        {t.noFile}
                      </Badge>
                    ) : null}
                  </span>
                </td>
                <td className={`${CELL} text-muted`}>{when(row.at, language)}</td>
                <td className={`${CELL} text-right tabular-nums`}>{row.steps}</td>
                <td className={`${CELL} text-right`}>
                  <span className="inline-flex items-center gap-1.5">
                    {missing.has(row.name) ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => {
                          setOpen((current) =>
                            current.has(row.name)
                              ? new Set([...current].filter((name) => name !== row.name))
                              : new Set([...current, row.name]),
                          )
                        }}
                      >
                        {open.has(row.name) ? (
                          <LuChevronDown size={13} />
                        ) : (
                          <LuChevronRight size={13} />
                        )}
                        {open.has(row.name) ? t.hideSql : t.showSql}
                      </Button>
                    )}
                    {row.state === 'failed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        isDisabled={resolving}
                        onPress={() => {
                          onResolve(row.name)
                        }}
                      >
                        <LuUndo2 size={13} />
                        {t.markRolledBack}
                      </Button>
                    ) : null}
                  </span>
                </td>
              </tr>
              {open.has(row.name) ? (
                <tr className="border-b border-line last:border-b-0">
                  <td colSpan={5} className="px-3 pb-3">
                    <MigrationSql name={row.name} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
      {missing.size === 0 ? null : (
        <p className="m-0 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-body text-danger">
          {t.missingFiles(status.migrationsDir)}
        </p>
      )}
    </div>
  )
}
