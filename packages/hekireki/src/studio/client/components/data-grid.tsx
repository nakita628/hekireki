import { Button, Checkbox, Dropdown, Kbd, Pagination, Table } from '@heroui/react'
import { useState } from 'react'
import type { Selection } from 'react-aria-components'
import {
  LuCheck,
  LuChevronsLeft,
  LuChevronsRight,
  LuCopy,
  LuEllipsis,
  LuKey,
  LuLink,
  LuTrash2,
  LuX,
} from 'react-icons/lu'

import {
  displayCell,
  editableText,
  keyOf,
  parseCellInput,
  rowId,
  toJson,
  toTsv,
} from '../features/data/cells.js'
import { PAGE_SIZE } from '../features/data/paging.js'
import { copyText } from '../hooks/copy.js'
import { fieldTypeLabel } from './labels.js'
import { MarkedText } from './marked-text.js'

type Row = Record<string, string | number | boolean | null>

type Field = {
  readonly name: string
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isForeignKey: boolean
  readonly default: string | null
  readonly documentation: string | null
}

type Model = {
  readonly name: string
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly Field[]
}

type Schema = {
  readonly enums: readonly {
    readonly name: string
    readonly values: readonly { readonly name: string }[]
  }[]
}

/** The key of the row being typed in, which is the one row that has no key of its own yet. */
const NEW_ROW = '__new__'

function enumValues(schema: Schema, field: Field) {
  return schema.enums.find((e) => e.name === field.type)?.values.map((value) => value.name) ?? []
}

function optionsFor(schema: Schema, field: Field) {
  return field.kind === 'enum'
    ? enumValues(schema, field)
    : field.type === 'Boolean' && !field.isList
      ? ['true', 'false']
      : null
}

function CellEditor({
  field,
  schema,
  initial,
  onCommit,
  onCancel,
}: {
  readonly field: Field
  readonly schema: Schema
  readonly initial: string
  readonly onCommit: (text: string) => void
  readonly onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const options = optionsFor(schema, field)
  // The table reads arrow keys, Home/End and plain letters as navigation and type-ahead. An open
  // editor is a text box first: every key it sees stops here, and only Enter and Escape act.
  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'Enter') onCommit(text)
    if (event.key === 'Escape') onCancel()
  }
  if (options) {
    return (
      <select
        autoFocus
        className="cell-input"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          onCommit(text)
        }}
      >
        {field.isRequired ? null : <option value="">NULL</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      autoFocus
      className="cell-input"
      value={text}
      placeholder={field.isRequired ? '' : 'NULL'}
      onChange={(event) => {
        setText(event.target.value)
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        onCommit(text)
      }}
    />
  )
}

function NewRowCells({
  fields,
  schema,
  draft,
  onDraftChange,
  onSubmit,
}: {
  readonly fields: readonly Field[]
  readonly schema: Schema
  readonly draft: Readonly<Record<string, string>>
  readonly onDraftChange: (draft: Readonly<Record<string, string>>) => void
  readonly onSubmit: () => void
}) {
  return fields.map((field) => {
    const options = optionsFor(schema, field)
    return (
      <Table.Cell key={field.name}>
        {options ? (
          <select
            className="cell-input"
            aria-label={field.name}
            value={draft[field.name] ?? ''}
            onKeyDown={(event) => {
              event.stopPropagation()
            }}
            onChange={(event) => {
              onDraftChange({ ...draft, [field.name]: event.target.value })
            }}
          >
            <option value="">
              {field.default === null ? 'NULL' : `default (${field.default})`}
            </option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="cell-input"
            aria-label={field.name}
            placeholder={
              field.default === null
                ? field.isRequired
                  ? 'required'
                  : 'NULL'
                : `default: ${field.default}`
            }
            value={draft[field.name] ?? ''}
            onChange={(event) => {
              onDraftChange({ ...draft, [field.name]: event.target.value })
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') onSubmit()
            }}
          />
        )}
      </Table.Cell>
    )
  })
}

function RowMenu({
  label,
  json,
  tsv,
  isDisabled,
  onDelete,
}: {
  readonly label: string
  readonly json: string
  readonly tsv: string
  readonly isDisabled: boolean
  readonly onDelete: () => void
}) {
  return (
    <Dropdown>
      <Button
        variant="ghost"
        size="sm"
        isIconOnly
        className="text-faint"
        aria-label={`Actions for ${label}`}
      >
        <LuEllipsis size={15} />
      </Button>
      <Dropdown.Popover placement="bottom start">
        <Dropdown.Menu
          aria-label={`Actions for ${label}`}
          onAction={(key) => {
            if (key === 'json') copyText(json, 'Row (JSON)')
            if (key === 'tsv') copyText(tsv, 'Row')
            if (key === 'delete') onDelete()
          }}
        >
          <Dropdown.Item id="tsv" textValue="Copy row">
            <LuCopy size={14} />
            Copy row
          </Dropdown.Item>
          <Dropdown.Item id="json" textValue="Copy row as JSON">
            <LuCopy size={14} />
            Copy row as JSON
          </Dropdown.Item>
          <Dropdown.Item
            id="delete"
            variant="danger"
            className="text-danger"
            isDisabled={isDisabled}
            textValue="Delete row"
          >
            <LuTrash2 size={14} />
            Delete row
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

type DataGridProps = {
  readonly schema: Schema
  readonly model: Model
  readonly rows: readonly Row[]
  readonly rowKey: readonly string[]
  readonly total: number
  readonly skip: number
  readonly search: string
  readonly loading: boolean
  readonly saving: boolean
  readonly adding: boolean
  readonly selected: Selection
  readonly selectedRows: readonly Row[]
  readonly onSelectedChange: (selected: Selection) => void
  readonly onAddingChange: (adding: boolean) => void
  readonly onPage: (skip: number) => void
  readonly onClearSearch: () => void
  readonly onInsert: (values: Row) => void
  readonly onUpdate: (where: Row, values: Row) => void
  readonly onDeleteRequest: (rows: readonly Row[]) => void
}

// Presents one page of rows and turns clicks into the callbacks above; it never fetches.
export function DataGrid({
  schema,
  model,
  rows,
  rowKey,
  total,
  skip,
  search,
  loading,
  saving,
  adding,
  selected,
  selectedRows,
  onSelectedChange,
  onAddingChange,
  onPage,
  onClearSearch,
  onInsert,
  onUpdate,
  onDeleteRequest,
}: DataGridProps) {
  const [editing, setEditing] = useState<{ readonly row: string; readonly field: string } | null>(
    null,
  )
  // Which cell the keyboard is standing on. React Aria's `Cell` takes no focus handler of its
  // own, so the cell is read back off the DOM — and where it sits in the table is all that is
  // needed to say which value it holds.
  const [focused, setFocused] = useState<{ readonly row: number; readonly column: number } | null>(
    null,
  )
  const [draft, setDraft] = useState<Readonly<Record<string, string>>>({})
  const fields = model.fields.filter((f) => f.kind !== 'object')
  const names = fields.map((f) => f.name)
  const primaryKey = new Set(model.primaryKey)
  const editable = rowKey.length > 0
  // A model without a key still has to draw without two rows colliding, so it is identified by
  // everything it holds — enough for React and for the grid, not enough to write back through.
  const identity = editable ? rowKey : names
  const from = total === 0 ? 0 : skip + 1
  const to = Math.min(skip + rows.length, total)
  // With a table of any size the two arrows matter more than the two steps: the last page is
  // otherwise fifty clicks away.
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.floor(skip / PAGE_SIZE) + 1

  const commitEdit = (row: Row, field: Field, text: string) => {
    setEditing(null)
    const next = parseCellInput(field, text)
    if (next === (row[field.name] ?? null)) return
    onUpdate(keyOf(row, rowKey), { [field.name]: next })
  }

  const submitNewRow = () => {
    onInsert(
      Object.fromEntries(
        fields.flatMap((field) => {
          const text = draft[field.name] ?? ''
          return text === '' ? [] : [[field.name, parseCellInput(field, text)]]
        }),
      ),
    )
  }

  const cancelNewRow = () => {
    setDraft({})
    onAddingChange(false)
  }

  const trackFocus = (event: React.FocusEvent) => {
    const cell =
      event.target instanceof HTMLElement
        ? event.target.closest('[role="gridcell"], [role="rowheader"]')
        : null
    const row = cell?.parentElement ?? null
    const body = row?.parentElement ?? null
    if (cell === null || row === null || body === null) {
      setFocused(null)
      return
    }
    const at = [...body.children].indexOf(row) - (adding ? 1 : 0)
    const column = [...row.children].indexOf(cell) - (editable ? 1 : 0)
    setFocused(at < 0 || column < 0 ? null : { row: at, column })
  }

  // ⌘/Ctrl+C over the grid: the rows that are ticked if any are, and otherwise the one cell the
  // keyboard is standing on. Neither is text the browser would have copied on its own, so the
  // chord is only taken when there is something to take it for.
  const copyFocused = () => {
    if (selectedRows.length > 0) {
      copyText(
        toTsv(names, selectedRows),
        `${selectedRows.length} ${selectedRows.length === 1 ? 'row' : 'rows'}`,
      )
      return true
    }
    const row = focused === null ? undefined : rows[focused.row]
    const field = focused === null ? undefined : fields[focused.column]
    if (row === undefined || field === undefined) return false
    copyText(displayCell(row[field.name] ?? null), field.name)
    return true
  }

  return (
    <Table
      variant="secondary"
      className="studio-table min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]"
      onFocusCapture={trackFocus}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key !== 'c' || !(event.metaKey || event.ctrlKey)) return
        if (copyFocused()) event.preventDefault()
      }}
    >
      <Table.ScrollContainer className={`min-h-0 overflow-auto${loading ? ' opacity-60' : ''}`}>
        {!editable ? (
          <div className="border-b border-line bg-surface-2 px-6 py-2 text-code text-muted">
            This model has no @id or @unique field, so rows are read-only.
          </div>
        ) : null}
        <Table.Content
          aria-label={`${model.name} rows`}
          className="font-mono text-code"
          selectionMode={editable ? 'multiple' : 'none'}
          selectedKeys={selected}
          onSelectionChange={onSelectedChange}
        >
          <Table.Header>
            {/* The checkbox and the row menu share one column, and it leads. A wide table scrolls
                sideways, and what a row can have done to it has to stay where it can be reached. */}
            {editable ? (
              <Table.Column className="w-[72px]">
                <Checkbox slot="selection" aria-label="Select every row on this page">
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              </Table.Column>
            ) : null}
            {fields.map((field, index) => (
              <Table.Column key={field.name} id={field.name} isRowHeader={index === 0}>
                <span
                  className="inline-flex items-center gap-1.5"
                  title={field.documentation ?? undefined}
                >
                  {field.isId || primaryKey.has(field.name) ? (
                    <LuKey size={12} className="text-key" />
                  ) : field.isForeignKey ? (
                    <LuLink size={12} className="text-accent" />
                  ) : null}
                  <span className="font-mono font-bold text-ink">{field.name}</span>
                  <span className="font-sans text-meta font-normal text-faint">
                    {fieldTypeLabel(field)}
                  </span>
                </span>
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body
            renderEmptyState={() => (
              <div className="flex flex-col items-center gap-3 px-6 py-12 font-sans text-muted">
                {search === '' ? (
                  <>
                    <p className="m-0">This table is empty.</p>
                    {editable ? (
                      <Button
                        variant="outline"
                        onPress={() => {
                          onAddingChange(true)
                        }}
                      >
                        Add the first row
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="m-0">
                      No row matches <span className="font-mono text-ink">{search}</span>.
                    </p>
                    <Button variant="outline" onPress={onClearSearch}>
                      Clear the search
                    </Button>
                  </>
                )}
              </div>
            )}
          >
            {[
              ...(adding
                ? [
                    <Table.Row
                      key={NEW_ROW}
                      id={NEW_ROW}
                      className="[&>.table__cell]:bg-accent-soft"
                    >
                      <Table.Cell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            isIconOnly
                            className="text-ok"
                            aria-label="Save row"
                            isDisabled={saving}
                            onPress={submitNewRow}
                          >
                            <LuCheck size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            isIconOnly
                            className="text-muted"
                            aria-label="Cancel"
                            onPress={cancelNewRow}
                          >
                            <LuX size={14} />
                          </Button>
                        </div>
                      </Table.Cell>
                      <NewRowCells
                        fields={fields}
                        schema={schema}
                        draft={draft}
                        onDraftChange={setDraft}
                        onSubmit={submitNewRow}
                      />
                    </Table.Row>,
                  ]
                : []),
              ...rows.map((row) => {
                const id = rowId(row, identity)
                const label = `${model.name} ${rowId(row, editable ? rowKey : identity)}`
                return (
                  <Table.Row key={id} id={id}>
                    {[
                      ...(editable
                        ? [
                            <Table.Cell key="__row">
                              <div className="flex items-center gap-0.5">
                                <Checkbox slot="selection" aria-label={`Select ${label}`}>
                                  <Checkbox.Content>
                                    <Checkbox.Control>
                                      <Checkbox.Indicator />
                                    </Checkbox.Control>
                                  </Checkbox.Content>
                                </Checkbox>
                                <RowMenu
                                  label={label}
                                  json={toJson(names, [row])}
                                  tsv={toTsv(names, [row])}
                                  isDisabled={saving}
                                  onDelete={() => {
                                    onDeleteRequest([row])
                                  }}
                                />
                              </div>
                            </Table.Cell>,
                          ]
                        : []),
                      ...fields.map((field) => {
                        const value = row[field.name] ?? null
                        const isEditing = editing?.row === id && editing.field === field.name
                        return (
                          <Table.Cell
                            key={field.name}
                            textValue={displayCell(value)}
                            className={`max-w-[360px]${editable ? ' cursor-text' : ''}`}
                            onClick={() => {
                              if (editable && !isEditing) setEditing({ row: id, field: field.name })
                            }}
                          >
                            {isEditing ? (
                              <CellEditor
                                field={field}
                                schema={schema}
                                initial={editableText(value)}
                                onCommit={(text) => {
                                  commitEdit(row, field, text)
                                }}
                                onCancel={() => {
                                  setEditing(null)
                                }}
                              />
                            ) : (
                              <span
                                className={`block truncate ${value === null ? 'text-faint italic' : ''}`}
                                title={value === null ? undefined : String(value)}
                              >
                                <MarkedText text={displayCell(value)} query={search} />
                              </span>
                            )}
                          </Table.Cell>
                        )
                      }),
                    ]}
                  </Table.Row>
                )
              }),
            ]}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
      <Table.Footer className="gap-3 border-t border-line bg-surface px-6 py-2 text-code text-muted">
        <Pagination size="sm" className="flex w-full items-center gap-3">
          <Pagination.Summary>
            {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}{' '}
            {total === 1 ? 'row' : 'rows'}
            {pages > 1 ? ` · page ${page.toLocaleString()} / ${pages.toLocaleString()}` : ''}
          </Pagination.Summary>
          <span className="hidden items-center gap-1.5 text-faint xl:flex">
            ·<Kbd>⌘/Ctrl</Kbd>
            <Kbd>C</Kbd>
            copies the cell, or every ticked row
          </span>
          <Pagination.Content className="ml-auto">
            <Pagination.Item>
              <Pagination.Link
                isDisabled={skip === 0}
                aria-label="First page"
                onPress={() => {
                  onPage(0)
                }}
              >
                <LuChevronsLeft />
              </Pagination.Link>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Previous
                isDisabled={skip === 0}
                onPress={() => {
                  onPage(Math.max(0, skip - PAGE_SIZE))
                }}
              >
                Previous
              </Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Next
                isDisabled={to >= total}
                onPress={() => {
                  onPage(skip + PAGE_SIZE)
                }}
              >
                Next
              </Pagination.Next>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Link
                isDisabled={to >= total}
                aria-label="Last page"
                onPress={() => {
                  onPage((pages - 1) * PAGE_SIZE)
                }}
              >
                <LuChevronsRight />
              </Pagination.Link>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      </Table.Footer>
    </Table>
  )
}
