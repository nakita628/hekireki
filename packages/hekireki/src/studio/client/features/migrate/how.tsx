import { useQuery } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'
import type { InferResponseType } from 'hono/client'
import { LuArrowDown, LuCircleAlert, LuTrash2 } from 'react-icons/lu'

import type { migrateClient } from '../../api/index.js'
import { dbClient } from '../../api/index.js'
import { useMessages } from './language.js'
import { HOW } from './messages.js'

type Check = InferResponseType<typeof migrateClient.migrate.plan.$post, 200>['checks'][number]

type HowText = (typeof HOW)['ja']
type Destination = Check['destinations'][number]

const BOX_TONES = {
  lost: 'border-danger/40 bg-danger/10 text-danger',
  to: 'border-accent/40 bg-accent-soft',
  from: 'border-line bg-surface',
} as const

/** A column, a table or where values end up: one end of the flow the panel draws. */
function Box({
  label,
  detail,
  badge,
  tone,
}: {
  readonly label: string
  readonly detail: string | null
  readonly badge: string | null
  readonly tone: 'from' | 'to' | 'lost'
}) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-md border px-3 py-2 ${BOX_TONES[tone]}`}>
      <span className="flex flex-wrap items-center gap-2">
        {tone === 'lost' ? <LuTrash2 size={13} /> : null}
        <span className="font-mono font-semibold">{label}</span>
        {badge === null ? null : (
          <span className="rounded-full border border-accent/30 px-2 py-px text-code text-accent-text">
            {badge}
          </span>
        )}
      </span>
      {detail === null ? null : <span className="text-code text-muted">{detail}</span>}
    </div>
  )
}

/** The arrow between two ends, with what carries the values along it. */
function Arrow({ label }: { readonly label: string }) {
  return (
    <div className="flex items-center gap-2 pl-3 text-code text-muted">
      <LuArrowDown className="shrink-0 text-accent-text" size={16} />
      <span className="font-mono">{label}</span>
    </div>
  )
}

/**
 * A few of the values a dropped column holds now, read when the panel opens: what is about to
 * move, or to be lost, shown as data rather than as a count.
 */
function Sample({ check }: { readonly check: Check }) {
  const t = useMessages(HOW)
  const column = check.facts['column'] ?? check.field
  const sample = useQuery({
    queryKey: ['migrate', 'sample', check.lost],
    enabled: check.lost !== null,
    queryFn: () =>
      parseResponse(
        dbClient.db.sql.$post({
          json: { sql: `SELECT * FROM (${check.lost ?? ''}) AS hk_sample LIMIT 3` },
        }),
      ),
  })
  if (check.lost === null || sample.data === undefined) return null
  const [key] = sample.data.columns
  return (
    <div className="flex flex-col gap-1">
      <span className="text-code text-muted">{t.now}</span>
      {sample.data.rows.length === 0 ? (
        <span className="text-code text-muted">{t.noSample}</span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 font-mono text-code">
          {sample.data.rows.map((row, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- a sample of three, read once and never reordered
            <li key={index} className="truncate">
              <span className="text-muted">
                {key === undefined ? '' : `${key} ${String(row[key] ?? '')}: `}
              </span>
              {JSON.stringify(row[column] ?? null)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** What a fill writes, as the decision names it. */
function whatOf(choice: string, value: string, t: HowText) {
  if (choice === 'sql') return t.sqlOf(value)
  return choice === 'value' ? t.valueOf(value) : value
}

/** Where the values of a column go, said in a sentence. */
function moveSentence(
  check: Check,
  choice: string,
  destination: Destination,
  model: string,
  n: number,
  t: HowText,
) {
  const via = destination.via ?? ''
  if (choice === 'rename') return t.rename(destination.value, n)
  if (destination.created) return t.moveCreated(model, via)
  return destination.relation === 'points-here'
    ? t.movePointsHere(model, check.modelName, via)
    : t.movePointedAt(model, check.modelName, via)
}

/** The flow of a dropped or recreated column: dropped, converted, or carried to where it goes. */
function ColumnFlow({
  check,
  choice,
  value,
  t,
}: {
  readonly check: Check
  readonly choice: string
  readonly value: string
  readonly t: HowText
}) {
  const n = check.count ?? 0
  const source = `${check.modelName}.${check.facts['column'] ?? check.field}`
  if (choice === 'drop') {
    return (
      <>
        <Box label={source} detail={t.values(n)} badge={null} tone="from" />
        <Arrow label="DROP COLUMN" />
        <Box label={t.lost} detail={null} badge={null} tone="lost" />
        <p className="m-0 text-body text-danger">{t.drop(n)}</p>
      </>
    )
  }
  if (check.kind === 'column-recreated' && choice === 'sql') {
    return <p className="m-0 text-body">{t.convert(check.facts['to'] ?? '', value)}</p>
  }
  const destination = check.destinations.find(
    (place) => place.choice === choice && place.value === value.trim(),
  )
  if (destination === undefined) {
    return (
      <>
        <Box label={source} detail={t.values(n)} badge={null} tone="from" />
        <p className="m-0 flex items-start gap-1.5 text-body text-danger">
          <LuCircleAlert className="mt-0.5 shrink-0" size={14} />
          {t.unknown(value.trim(), choice === 'move')}
        </p>
      </>
    )
  }
  const target = choice === 'rename' ? `${check.modelName}.${destination.value}` : destination.value
  const [model = target] = target.split('.')
  return (
    <>
      <Box label={source} detail={t.values(n)} badge={null} tone="from" />
      <Arrow label={choice === 'rename' ? t.renamed : t.along(destination.via ?? '')} />
      <Box
        label={target}
        detail={destination.type}
        badge={destination.created ? t.newTable : t.addedColumn}
        tone="to"
      />
      {destination.fits ? null : (
        <p className="m-0 text-body text-accent-text">{t.misfit(destination.type)}</p>
      )}
      <p className="m-0 text-body">{moveSentence(check, choice, destination, model, n, t)}</p>
      {choice === 'move' ? (
        <ol className="m-0 flex flex-col gap-0.5 pl-5 text-code text-muted">
          <li>{t.keepStep(source)}</li>
          <li>{t.writeStep(target, destination.created)}</li>
          <li>{t.dropStep}</li>
        </ol>
      ) : null}
    </>
  )
}

const MAPPING_PAIR = /(?:"(?:[^"]|"")*"|[^,\n])+/gu
const MAPPING_SIDES = /^\s*(?:"(?<quoted>(?:[^"]|"")*)"|(?<bare>[^="]*?))\s*=\s*(?<member>.*?)\s*$/u

/**
 * The stored values and the members they become, as the check reads them (`parseMapping`): a
 * stored value with a comma, an equals sign or a quote in it is in double quotes, a quote in it
 * doubled.
 */
function mappingPairs(value: string) {
  return (value.match(MAPPING_PAIR) ?? [])
    .map((pair) => {
      const groups = MAPPING_SIDES.exec(pair)?.groups
      return [
        groups?.['quoted']?.replaceAll('""', '"') ?? groups?.['bare'] ?? '',
        groups?.['member'] ?? '',
      ]
    })
    .filter(([stored, member]) => stored !== '' && member !== '')
}

function EnumMapping({ value, t }: { readonly value: string; readonly t: HowText }) {
  return (
    <>
      <p className="m-0 text-body">{t.map}</p>
      <table className="w-full border-collapse font-mono text-code">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-0.5 font-normal">{t.stored}</th>
            <th className="py-0.5 font-normal">{t.becomes}</th>
          </tr>
        </thead>
        <tbody>
          {mappingPairs(value).map(([stored = '', member = '']) => (
            <tr key={stored} className="border-t border-line">
              <td className="py-0.5">{stored}</td>
              <td className="py-0.5 text-accent-text">{member}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** Which of the duplicates is kept, and what happens to the others. */
function uniqueSentence(check: Check, choice: string, value: string, t: HowText) {
  const [keep = 'first', others = 'delete'] = choice.split('-').slice(1)
  return t.keep(
    check.facts['fields'] ?? check.field,
    check.count ?? 0,
    keep === 'first',
    value.trim() === '' ? t.primaryKey : value.trim(),
    others === 'delete',
  )
}

/** What happens to the values that do not fit the new type. */
function invalidSentence(check: Check, choice: string, value: string, t: HowText) {
  const n = check.count ?? 0
  const to = check.facts['to'] ?? ''
  if (choice === 'clamp') return t.clamp(n, to)
  if (choice === 'truncate') return t.truncate(n, to)
  if (choice === 'null') return t.invalidNull(n)
  if (choice === 'delete') return t.invalidDelete(n)
  return t.fill(n, whatOf(choice, value, t))
}

/** The sentence a check that only fills, deletes or converts is said in. */
function sentenceOf(check: Check, choice: string, value: string, t: HowText) {
  const n = check.count ?? 0
  if (check.kind === 'not-null') return t.fill(n, whatOf(choice, value, t))
  if (check.kind === 'column-added') return t.fillAdded(n, whatOf(choice, value, t))
  if (check.kind === 'unique') return uniqueSentence(check, choice, value, t)
  if (check.kind === 'foreign-key') {
    return (choice === 'delete' ? t.orphansDelete : t.orphansNull)(n, check.facts['target'] ?? '')
  }
  if (check.kind === 'column-type') return t.convert(check.facts['to'] ?? '', value)
  return invalidSentence(check, choice, value, t)
}

function HowBody({
  check,
  choice,
  value,
}: {
  readonly check: Check
  readonly choice: string
  readonly value: string
}) {
  const t = useMessages(HOW)
  if (choice === '') return <p className="m-0 text-body text-muted">{t.nothingChosen}</p>
  if (check.kind === 'column-dropped' || check.kind === 'column-recreated') {
    return <ColumnFlow check={check} choice={choice} value={value} t={t} />
  }
  if (check.kind === 'enum') return <EnumMapping value={value} t={t} />
  return <p className="m-0 text-body">{sentenceOf(check, choice, value, t)}</p>
}

/**
 * How the decision being made migrates the data, beside it and redrawn as it changes: where the
 * values come from and where they go, along which key, what is created or lost on the way, and
 * the steps the plan takes. A destination that is not one the migration adds is said to be so
 * before the plan refuses it.
 */
export function How({
  check,
  choice,
  value,
}: {
  readonly check: Check
  readonly choice: string
  readonly value: string
}) {
  const t = useMessages(HOW)
  return (
    <aside
      aria-label={t.title}
      data-testid="how"
      className="flex flex-col gap-2 self-start rounded-lg border border-line bg-canvas px-3 py-2.5 lg:sticky lg:top-2"
    >
      <span className="text-body font-semibold">{t.title}</span>
      <HowBody check={check} choice={choice} value={value} />
      {check.kind === 'column-dropped' ? <Sample check={check} /> : null}
    </aside>
  )
}
