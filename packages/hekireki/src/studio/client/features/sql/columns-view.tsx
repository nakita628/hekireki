import { Link } from '@tanstack/react-router'

import type { OutputColumn, StatementAnalysis } from './analysis.js'

function tsUnion(column: OutputColumn) {
  return column.nullable === true && column.tsType !== 'null' && column.tsType !== 'unknown'
    ? `${column.tsType} | null`
    : column.tsType
}

/**
 * The columns of the result and where each one comes from, plus every table the statement
 * touches; a table the schema knows links to its model page.
 */
export function ColumnsView({
  statement,
  modelOf,
}: {
  readonly statement: StatementAnalysis
  readonly modelOf: (table: string) => string | null
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="heading px-4 pt-4">Result columns · {statement.columns.length}</div>
      {statement.columns.length === 0 ? (
        <p className="m-0 px-4 pb-4 text-muted">
          {statement.kind === 'select'
            ? 'The statement yields no columns.'
            : 'A write without RETURNING yields no rows.'}
        </p>
      ) : (
        <table className="w-full border-collapse font-mono">
          <thead>
            <tr>
              <th className="th">Column</th>
              <th className="th">Expression</th>
              <th className="th">Type</th>
              <th className="th">TypeScript</th>
              <th className="th">Comes from</th>
            </tr>
          </thead>
          <tbody>
            {statement.columns.map((column, index) => (
              // Two output columns can share a name; the position is the only stable key.
              // oxlint-disable-next-line react/no-array-index-key
              <tr key={index}>
                <td className="td font-semibold text-ink">{column.name}</td>
                <td className="td max-w-[320px] truncate text-muted" title={column.expression}>
                  {column.expression}
                </td>
                <td className="td text-muted">{column.dataType ?? '—'}</td>
                <td className="td">
                  <span className={column.tsType === 'unknown' ? 'text-faint' : 'text-kind-output'}>
                    {tsUnion(column)}
                  </span>
                </td>
                <td className="td">
                  {column.sources.length === 0 ? (
                    <span className="text-faint">computed</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {column.sources.map((source) => {
                        const model = modelOf(source.table)
                        return model === null ? (
                          <span
                            key={`${source.table}.${source.column}`}
                            className="pill border-line bg-canvas text-muted"
                          >
                            {source.table}.{source.column}
                          </span>
                        ) : (
                          <Link
                            key={`${source.table}.${source.column}`}
                            to="/models/$name"
                            params={{ name: model }}
                            className="pill border-line bg-canvas text-muted hover:border-accent hover:text-accent-text"
                          >
                            {source.table}.{source.column}
                          </Link>
                        )
                      })}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="heading px-4 pt-6">Tables · {statement.tables.length}</div>
      {statement.tables.length === 0 ? (
        <p className="m-0 px-4 pb-4 text-muted">The statement reads no table.</p>
      ) : (
        <table className="w-full border-collapse font-mono">
          <thead>
            <tr>
              <th className="th">Table</th>
              <th className="th">Alias</th>
              <th className="th">In</th>
              <th className="th">Columns used</th>
            </tr>
          </thead>
          <tbody>
            {statement.tables.map((table) => {
              const model = modelOf(table.name)
              return (
                <tr key={table.nodeId}>
                  <td className="td font-semibold">
                    {model === null ? (
                      <span
                        className={table.known ? 'text-ink' : 'text-danger'}
                        title={table.known ? undefined : 'Not in the schema'}
                      >
                        {table.name}
                      </span>
                    ) : (
                      <Link
                        to="/models/$name"
                        params={{ name: model }}
                        className="text-ink hover:text-accent-text"
                      >
                        {table.name}
                      </Link>
                    )}
                  </td>
                  <td className="td text-muted">{table.alias ?? '—'}</td>
                  <td className="td text-muted">{table.scope}</td>
                  <td className="td text-muted">
                    {table.columnsUsed.length === 0 ? '—' : table.columnsUsed.join(', ')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
