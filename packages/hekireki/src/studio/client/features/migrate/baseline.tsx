import { Button } from '@heroui/react'
import { useState } from 'react'
import {
  LuChevronDown,
  LuChevronRight,
  LuCircleCheck,
  LuCircleX,
  LuDatabaseBackup,
  LuSparkles,
} from 'react-icons/lu'

import { CodeBlock } from '../../components/code-block.js'
import { useMigrateBaseline } from '../../hooks/index.js'
import { useMessages } from './language.js'
import { BASELINE } from './messages.js'
import { problemReason } from './problem.js'

function Candidate({
  name,
  matches,
  difference,
  suggested,
  busy,
  onRecord,
}: {
  readonly name: string
  readonly matches: boolean
  readonly difference: string
  readonly suggested: boolean
  readonly busy: boolean
  readonly onRecord: () => void
}) {
  const t = useMessages(BASELINE)
  const [open, setOpen] = useState(false)
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {matches ? (
          <LuCircleCheck className="shrink-0 text-ok" size={16} />
        ) : (
          <LuCircleX className="shrink-0 text-danger" size={16} />
        )}
        <span className="font-mono">{name}</span>
        <span className={`text-code ${matches ? 'text-ok' : 'text-danger'}`}>
          {matches ? t.matches : t.differs}
        </span>
        {suggested ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-px text-code text-white">
            <LuSparkles size={11} />
            {t.suggested}
          </span>
        ) : null}
        {matches ? (
          <Button
            className="ml-auto"
            size="sm"
            variant={suggested ? 'primary' : 'outline'}
            isDisabled={busy}
            onPress={onRecord}
          >
            <LuDatabaseBackup size={13} />
            {t.record}
          </Button>
        ) : null}
      </div>
      {matches ? null : (
        <div className="pl-6">
          <button
            type="button"
            className="flex items-center gap-1 text-code text-muted"
            onClick={() => {
              setOpen((current) => !current)
            }}
          >
            {open ? <LuChevronDown size={13} /> : <LuChevronRight size={13} />}
            {t.showDifference}
          </button>
          {open ? <CodeBlock code={difference} language="sql" /> : null}
        </div>
      )}
    </li>
  )
}

/**
 * A database with tables and no migration history, which Prisma Migrate refuses to deploy to:
 * what that means, and each migration replayed into a shadow database and compared with it, so it
 * can be baselined at the latest one it already matches.
 */
export function Baseline({
  busy,
  onRecord,
}: {
  readonly busy: boolean
  readonly onRecord: (name: string) => void
}) {
  const t = useMessages(BASELINE)
  // Each comparison replays migrations into a shadow database: done once, not on every focus.
  const baseline = useMigrateBaseline({
    query: { retry: false, refetchOnWindowFocus: false },
  })
  const candidates = baseline.data?.candidates ?? []
  const suggested = candidates.findLast((candidate) => candidate.matches)?.name ?? null
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3">
      <span className="font-semibold text-accent-text">{t.title}</span>
      <p className="m-0 text-body">{t.explain}</p>
      {baseline.isPending ? <p className="m-0 text-body text-muted">{t.checking}</p> : null}
      {baseline.isError ? (
        <p className="m-0 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 whitespace-pre-wrap text-danger">
          {problemReason(baseline.error) ?? t.unreadable}
        </p>
      ) : null}
      {candidates.length === 0 ? null : (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {candidates.map((candidate) => (
              <Candidate
                key={candidate.name}
                name={candidate.name}
                matches={candidate.matches}
                difference={candidate.difference}
                suggested={candidate.name === suggested}
                busy={busy}
                onRecord={() => {
                  onRecord(candidate.name)
                }}
              />
            ))}
          </ul>
          <p className="m-0 text-code text-muted">
            {suggested === null ? t.noMatch : t.recordNote}
          </p>
        </>
      )}
    </div>
  )
}
