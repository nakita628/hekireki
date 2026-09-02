import type { Row } from '../../server/routes/index.js'
import { displayCell } from '../features/data/cells.js'

export function ResultTable({
  columns,
  rows,
}: {
  readonly columns: readonly string[]
  readonly rows: readonly Row[]
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse font-mono text-[12.5px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className="th font-bold text-ink">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // SQL result rows carry no identity of their own; the position is the only stable key.
            // oxlint-disable-next-line react/no-array-index-key
            <tr key={index} className="hover:bg-canvas">
              {columns.map((column) => {
                const value = row[column] ?? null
                return (
                  <td
                    key={column}
                    className={`max-w-[360px] truncate border-b border-line px-3 py-1.5 ${value === null ? 'text-faint italic' : ''}`}
                    title={value === null ? undefined : String(value)}
                  >
                    {displayCell(value)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
