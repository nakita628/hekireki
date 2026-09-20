import { useMessages } from './language.js'
import { REHEARSAL } from './messages.js'

/**
 * The rows of each table before a run and after it, with what changed marked: a table that lost
 * rows in red, one that went away or came to be said in words. A table whose rows did not change
 * is listed too, so a count that stayed can be read as having stayed.
 */
export function RowCounts({
  tables,
}: {
  readonly tables: readonly {
    readonly table: string
    readonly before: number | null
    readonly after: number | null
  }[]
}) {
  const t = useMessages(REHEARSAL)
  return (
    <table className="w-full border-collapse text-body">
      <thead>
        <tr className="text-left text-code text-muted">
          <th className="py-1 pr-3 font-normal">{t.table}</th>
          <th className="py-1 pr-3 text-right font-normal">{t.before}</th>
          <th className="py-1 pr-3 text-right font-normal">{t.after}</th>
          <th className="py-1 text-right font-normal">{t.change}</th>
        </tr>
      </thead>
      <tbody>
        {tables.map((row) => {
          const change =
            row.before === null
              ? t.added
              : row.after === null
                ? t.gone
                : row.after === row.before
                  ? '±0'
                  : `${row.after > row.before ? '+' : ''}${row.after - row.before}`
          const lost = row.after === null || (row.before !== null && row.after < row.before)
          return (
            <tr key={row.table} className="border-t border-line">
              <td className="py-1 pr-3 font-mono">{row.table}</td>
              <td className="py-1 pr-3 text-right font-mono">{row.before ?? '—'}</td>
              <td className="py-1 pr-3 text-right font-mono">{row.after ?? '—'}</td>
              <td
                className={`py-1 text-right font-mono ${lost ? 'font-semibold text-danger' : change === '±0' ? 'text-muted' : 'text-ok'}`}
              >
                {change}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
