import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'

import type { Field, Model, Schema } from '../../server/routes/index.js'
import { fieldTypeLabel } from '../lib/labels.js'
import { KeyIcon, LinkIcon } from './icons.js'

export function FieldGlyph({
  field,
  primaryKey,
}: {
  readonly field: Field
  readonly primaryKey: ReadonlySet<string>
}) {
  if (field.isId || primaryKey.has(field.name)) {
    return (
      <KeyIcon size={13} className="inline-block align-middle text-amber-600 dark:text-amber-400" />
    )
  }
  if (field.isForeignKey) {
    return <LinkIcon size={13} className="inline-block align-middle text-accent" />
  }
  return <span className="inline-block size-[13px] align-middle" />
}

function TypeLink({ field, schema }: { readonly field: Field; readonly schema: Schema }) {
  const label = fieldTypeLabel(field)
  if (field.kind === 'object' && schema.models.some((m) => m.name === field.type)) {
    return (
      <Link
        className="font-mono text-[12.5px] font-semibold text-accent-text hover:underline"
        to="/models/$name"
        params={{ name: field.type }}
        search={{}}
      >
        {label}
      </Link>
    )
  }
  if (field.kind === 'enum' && schema.enums.some((e) => e.name === field.type)) {
    return (
      <Link
        className="font-mono text-[12.5px] font-semibold text-violet-600 hover:underline dark:text-violet-300"
        to="/enums/$name"
        params={{ name: field.type }}
      >
        {label}
      </Link>
    )
  }
  return <span className="font-mono text-[12.5px]">{label}</span>
}

export function FieldsTable({
  schema,
  model,
  query,
}: {
  readonly schema: Schema
  readonly model: Model
  readonly query: string
}) {
  const primaryKey = useMemo(() => new Set(model.primaryKey), [model])
  const fields = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q === ''
      ? model.fields
      : model.fields.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.type.toLowerCase().includes(q) ||
            f.attributes.some((a) => a.toLowerCase().includes(q)) ||
            (f.documentation ?? '').toLowerCase().includes(q),
        )
  }, [model, query])
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="th w-9 pr-0" aria-label="Kind" />
            <th className="th">Field</th>
            <th className="th">Type</th>
            <th className="th">Attributes</th>
            <th className="th">Documentation</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name} className={field.kind === 'object' ? 'bg-surface-2' : ''}>
              <td className="w-9 border-b border-line py-2.5 pl-3.5">
                <FieldGlyph field={field} primaryKey={primaryKey} />
              </td>
              <td className="border-b border-line px-3.5 py-2.5 align-top font-mono text-[12.5px] font-semibold whitespace-nowrap">
                {field.name}
                {field.dbName ? (
                  <span className="mt-0.5 block text-[11.5px] font-normal text-faint">
                    {field.dbName}
                  </span>
                ) : null}
              </td>
              <td className="border-b border-line px-3.5 py-2.5 align-top">
                <TypeLink field={field} schema={schema} />
              </td>
              <td className="border-b border-line px-3.5 py-2.5 align-top">
                <div className="flex flex-wrap gap-1">
                  {field.attributes.map((attribute) => (
                    <span key={attribute} className="chip">
                      {attribute}
                    </span>
                  ))}
                </div>
              </td>
              <td className="max-w-[420px] border-b border-line px-3.5 py-2.5 align-top text-muted">
                {field.documentation ?? <span className="text-faint">—</span>}
                {field.annotations.length > 0 ? (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {field.annotations.map((annotation) => (
                      <code key={annotation} className="text-[11px] text-faint">
                        {annotation}
                      </code>
                    ))}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
          {fields.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3.5 py-6 text-muted">
                No field matches “{query}”.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
