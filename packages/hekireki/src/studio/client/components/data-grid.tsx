import { useState } from 'react'

import type { Field, Model, Row, Schema } from '../../server/routes/index.js'
import { displayCell, editableText, keyOf, parseCellInput } from '../features/data/cells.js'
import { PAGE_SIZE } from '../features/data/paging.js'
import { CheckIcon, KeyIcon, LinkIcon, TrashIcon, XIcon } from './icons.js'
import { fieldTypeLabel } from './labels.js'

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
  const onKeyDown = (event: React.KeyboardEvent) => {
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

function NewRowForm({
  fields,
  schema,
  onSave,
  onCancel,
  saving,
}: {
  readonly fields: readonly Field[]
  readonly schema: Schema
  readonly onSave: (values: Row) => void
  readonly onCancel: () => void
  readonly saving: boolean
}) {
  const [draft, setDraft] = useState<Readonly<Record<string, string>>>({})
  const submit = () => {
    onSave(
      Object.fromEntries(
        fields.flatMap((field) => {
          const text = draft[field.name] ?? ''
          return text === '' ? [] : [[field.name, parseCellInput(field, text)]]
        }),
      ),
    )
  }
  return (
    <tr className="bg-accent-soft/60">
      <td className="border-b border-line px-2 py-1.5">
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded p-1 text-green-700 hover:bg-surface dark:text-green-400"
            title="Save row"
            aria-label="Save row"
            disabled={saving}
            onClick={submit}
          >
            <CheckIcon size={14} />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted hover:bg-surface"
            title="Cancel"
            aria-label="Cancel"
            onClick={onCancel}
          >
            <XIcon size={14} />
          </button>
        </div>
      </td>
      {fields.map((field) => {
        const options = optionsFor(schema, field)
        return (
          <td key={field.name} className="border-b border-line px-2 py-1.5">
            {options ? (
              <select
                className="cell-input"
                value={draft[field.name] ?? ''}
                onChange={(event) => {
                  setDraft({ ...draft, [field.name]: event.target.value })
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
                placeholder={
                  field.default === null
                    ? field.isRequired
                      ? 'required'
                      : 'NULL'
                    : `default: ${field.default}`
                }
                value={draft[field.name] ?? ''}
                onChange={(event) => {
                  setDraft({ ...draft, [field.name]: event.target.value })
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit()
                }}
              />
            )}
          </td>
        )
      })}
    </tr>
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
  readonly onAddingChange: (adding: boolean) => void
  readonly onPage: (skip: number) => void
  readonly onInsert: (values: Row) => void
  readonly onUpdate: (where: Row, values: Row) => void
  readonly onDelete: (where: Row) => void
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
  onAddingChange,
  onPage,
  onInsert,
  onUpdate,
  onDelete,
}: DataGridProps) {
  const [editing, setEditing] = useState<{ readonly row: number; readonly field: string } | null>(
    null,
  )
  const fields = model.fields.filter((f) => f.kind !== 'object')
  const primaryKey = new Set(model.primaryKey)
  const editable = rowKey.length > 0
  const from = total === 0 ? 0 : skip + 1
  const to = Math.min(skip + rows.length, total)

  const commitEdit = (row: Row, field: Field, text: string) => {
    setEditing(null)
    const next = parseCellInput(field, text)
    if (next === (row[field.name] ?? null)) return
    onUpdate(keyOf(row, rowKey), { [field.name]: next })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!editable ? (
        <div className="border-b border-line bg-surface-2 px-6 py-2 text-xs text-muted">
          This model has no @id or @unique field, so rows are read-only.
        </div>
      ) : null}
      <div className={`min-h-0 flex-1 overflow-auto${loading ? ' opacity-60' : ''}`}>
        <table className="w-full border-collapse font-mono text-[12.5px]">
          <thead>
            <tr>
              <th className="th w-9" aria-label="Row actions" />
              {fields.map((field) => (
                <th key={field.name} className="th" title={field.documentation ?? undefined}>
                  <span className="inline-flex items-center gap-1.5">
                    {field.isId || primaryKey.has(field.name) ? (
                      <KeyIcon size={12} className="text-amber-600 dark:text-amber-400" />
                    ) : field.isForeignKey ? (
                      <LinkIcon size={12} className="text-accent" />
                    ) : null}
                    <span className="font-bold text-ink">{field.name}</span>
                    <span className="font-sans text-[11px] font-normal text-faint">
                      {fieldTypeLabel(field)}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adding ? (
              <NewRowForm
                fields={fields}
                schema={schema}
                saving={saving}
                onSave={onInsert}
                onCancel={() => {
                  onAddingChange(false)
                }}
              />
            ) : null}
            {rows.map((row, rowIndex) => (
              <tr
                key={JSON.stringify(
                  keyOf(row, rowKey.length > 0 ? rowKey : fields.map((f) => f.name)),
                )}
                className="group hover:bg-canvas"
              >
                <td className="border-b border-line px-2 py-1 text-center">
                  <button
                    type="button"
                    className="rounded p-1 text-faint opacity-60 group-hover:opacity-100 hover:bg-surface hover:text-danger disabled:opacity-20"
                    title="Delete row"
                    aria-label="Delete row"
                    disabled={!editable || saving}
                    onClick={() => {
                      if (globalThis.confirm(`Delete this ${model.name} row?`)) {
                        onDelete(keyOf(row, rowKey))
                      }
                    }}
                  >
                    <TrashIcon size={14} />
                  </button>
                </td>
                {fields.map((field) => {
                  const value = row[field.name] ?? null
                  const isEditing = editing?.row === rowIndex && editing.field === field.name
                  return (
                    <td
                      key={field.name}
                      className={`max-w-[360px] border-b border-line px-3 py-1.5 align-top ${editable ? 'cursor-text' : ''}`}
                      onClick={() => {
                        if (editable && !isEditing) setEditing({ row: rowIndex, field: field.name })
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
                          {displayCell(value)}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {rows.length === 0 && !adding ? (
              <tr>
                <td
                  colSpan={fields.length + 1}
                  className="px-6 py-8 text-center font-sans text-muted"
                >
                  {search === '' ? 'No rows yet.' : `No row matches “${search}”.`}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center gap-3 border-t border-line bg-surface px-6 py-2 text-xs text-muted">
        <span>
          {from}–{to} of {total} {total === 1 ? 'row' : 'rows'}
        </span>
        <span className="ml-auto flex gap-1">
          <button
            type="button"
            className="btn h-7 px-2.5 text-xs"
            disabled={skip === 0}
            onClick={() => {
              onPage(Math.max(0, skip - PAGE_SIZE))
            }}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn h-7 px-2.5 text-xs"
            disabled={to >= total}
            onClick={() => {
              onPage(skip + PAGE_SIZE)
            }}
          >
            Next
          </button>
        </span>
      </footer>
    </div>
  )
}
