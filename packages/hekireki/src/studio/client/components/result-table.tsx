import { Button, Dropdown, SearchField, Table } from '@heroui/react'
import { useMemo, useState } from 'react'
import type { SortDescriptor } from 'react-aria-components'
import { LuCopy, LuDownload } from 'react-icons/lu'

import { displayCell, toCsv, toJson, toTsv } from '../features/data/cells.js'
import { copyText } from '../hooks/copy.js'
import { MarkedText } from './marked-text.js'

type Row = Record<string, string | number | boolean | null>

function compare(a: Row[string], b: Row[string]) {
  if (a === b) return 0
  // NULLs go last whichever way the column is sorted, as they do in a spreadsheet.
  if (a === null) return 1
  if (b === null) return -1
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true })
}

function download(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * The rows a statement came back with. The server has already sent everything it is going to
 * send, so the filter and the ordering are done here: a result nobody paged through is a result
 * that can be narrowed and sorted without asking the database a second question.
 */
export function ResultTable({
  columns,
  rows,
}: {
  readonly columns: readonly string[]
  readonly rows: readonly Row[]
}) {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<SortDescriptor | null>(null)

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const kept =
      needle === ''
        ? rows
        : rows.filter((row) =>
            columns.some((column) =>
              displayCell(row[column] ?? null)
                .toLowerCase()
                .includes(needle),
            ),
          )
    if (sort === null) return kept
    const column = String(sort.column)
    const ordered = [...kept].toSorted((a, b) => compare(a[column] ?? null, b[column] ?? null))
    return sort.direction === 'descending' ? ordered.toReversed() : ordered
  }, [rows, columns, filter, sort])

  const copy = (action: string | number) => {
    if (action === 'tsv') copyText(toTsv(columns, shown), `${shown.length} rows`)
    if (action === 'csv') copyText(toCsv(columns, shown), `${shown.length} rows (CSV)`)
    if (action === 'json') copyText(toJson(columns, shown), `${shown.length} rows (JSON)`)
    if (action === 'download-csv') download('result.csv', toCsv(columns, shown), 'text/csv')
    if (action === 'download-json') {
      download('result.json', toJson(columns, shown), 'application/json')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-6 py-2">
        <SearchField
          className="min-w-[240px]"
          aria-label="Filter the result"
          value={filter}
          onChange={setFilter}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Filter the result…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <span className="text-code text-muted">
          {filter.trim() === ''
            ? null
            : `${shown.length.toLocaleString()} of ${rows.length.toLocaleString()} shown`}
        </span>
        <Dropdown>
          <Button variant="outline" className="ml-auto">
            <LuCopy size={15} />
            Copy
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu aria-label="Copy or download the result" onAction={copy}>
              <Dropdown.Item id="tsv" textValue="Copy rows">
                <LuCopy size={14} />
                Copy rows
              </Dropdown.Item>
              <Dropdown.Item id="csv" textValue="Copy rows as CSV">
                <LuCopy size={14} />
                Copy rows as CSV
              </Dropdown.Item>
              <Dropdown.Item id="json" textValue="Copy rows as JSON">
                <LuCopy size={14} />
                Copy rows as JSON
              </Dropdown.Item>
              <Dropdown.Item id="download-csv" textValue="Download CSV">
                <LuDownload size={14} />
                Download CSV
              </Dropdown.Item>
              <Dropdown.Item id="download-json" textValue="Download JSON">
                <LuDownload size={14} />
                Download JSON
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
      <Table variant="secondary" className="studio-table min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
        <Table.ScrollContainer className="min-h-0 overflow-auto">
          <Table.Content
            aria-label="Query result"
            className="font-mono text-code"
            sortDescriptor={sort ?? undefined}
            onSortChange={setSort}
          >
            <Table.Header>
              {columns.map((column, index) => (
                <Table.Column key={column} id={column} isRowHeader={index === 0} allowsSorting>
                  {({ sortDirection }) => (
                    <Table.SortableColumnHeader
                      className="font-bold text-ink"
                      sortDirection={sortDirection}
                    >
                      {column}
                    </Table.SortableColumnHeader>
                  )}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <p className="m-0 px-6 py-8 text-center font-sans text-muted">
                  No row matches <span className="font-mono text-ink">{filter}</span>.
                </p>
              )}
            >
              {shown.map((row, index) => (
                // SQL result rows carry no identity of their own; the position is the only stable key.
                // oxlint-disable-next-line react/no-array-index-key
                <Table.Row key={index} id={index}>
                  {columns.map((column) => {
                    const value = row[column] ?? null
                    return (
                      <Table.Cell
                        key={column}
                        textValue={displayCell(value)}
                        className={`max-w-[360px] truncate ${value === null ? 'text-faint italic' : ''}`}
                      >
                        <MarkedText text={displayCell(value)} query={filter} />
                      </Table.Cell>
                    )
                  })}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  )
}
