import { Chip, Table } from '@heroui/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import { LuKey, LuLink } from 'react-icons/lu'

import { CopyButton } from './copy-button.js'
import { fieldTypeLabel } from './labels.js'
import { MarkedText } from './marked-text.js'

type Field = {
  readonly name: string
  readonly dbName: string | null
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isForeignKey: boolean
  readonly documentation: string | null
  readonly annotations: readonly string[]
  readonly attributes: readonly string[]
}

type Model = {
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly Field[]
}

type Schema = {
  readonly models: readonly { readonly name: string }[]
  readonly enums: readonly { readonly name: string }[]
}

export function FieldGlyph({
  field,
  primaryKey,
}: {
  readonly field: {
    readonly name: string
    readonly isId: boolean
    readonly isForeignKey: boolean
  }
  readonly primaryKey: ReadonlySet<string>
}) {
  if (field.isId || primaryKey.has(field.name)) {
    return <LuKey size={13} className="inline-block align-middle text-key" />
  }
  if (field.isForeignKey) {
    return <LuLink size={13} className="inline-block align-middle text-accent" />
  }
  return <span className="inline-block size-[13px] align-middle" />
}

function TypeLink({ field, schema }: { readonly field: Field; readonly schema: Schema }) {
  const label = fieldTypeLabel(field)
  if (field.kind === 'object' && schema.models.some((m) => m.name === field.type)) {
    return (
      <Link
        className="font-mono text-code font-semibold text-accent-text hover:underline"
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
        className="font-mono text-code font-semibold text-enum hover:underline"
        to="/enums/$name"
        params={{ name: field.type }}
      >
        {label}
      </Link>
    )
  }
  return <span className="font-mono text-code">{label}</span>
}

export function FieldsTable({
  schema,
  model,
  query,
  highlight = null,
}: {
  readonly schema: Schema
  readonly model: Model
  readonly query: string
  /** One field to point at, for a link that arrived naming it. */
  readonly highlight?: string | null
}) {
  const primaryKey = useMemo(() => new Set(model.primaryKey), [model])
  const highlighted = useRef<HTMLTableRowElement>(null)
  // A model of forty fields opens below the one that was asked for, so the row is brought up —
  // again whenever another field is asked for, which does not remount the table.
  useEffect(() => {
    if (highlight === null) return
    highlighted.current?.scrollIntoView({ block: 'center' })
  }, [highlight])
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
    <Table variant="secondary" className="studio-table min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
      <Table.ScrollContainer className="min-h-0 overflow-auto">
        <Table.Content aria-label="Fields">
          <Table.Header>
            <Table.Column className="w-9 pr-0" aria-label="Kind" />
            <Table.Column isRowHeader>Field</Table.Column>
            <Table.Column>Type</Table.Column>
            <Table.Column>Attributes</Table.Column>
            <Table.Column>Documentation</Table.Column>
            <Table.Column className="w-9" aria-label="Copy" />
          </Table.Header>
          <Table.Body
            renderEmptyState={() => (
              <p className="m-0 px-6 py-8 text-center text-muted">
                No field matches <span className="font-mono text-ink">{query}</span>.
              </p>
            )}
          >
            {fields.map((field) => (
              <Table.Row
                key={field.name}
                id={field.name}
                ref={field.name === highlight ? highlighted : null}
                // The variant paints the cells, not the row, so a whole-row tint is asked of them.
                className={
                  field.name === highlight
                    ? '[&>.table__cell]:bg-accent-soft'
                    : field.kind === 'object'
                      ? '[&>.table__cell]:bg-surface-2'
                      : ''
                }
              >
                <Table.Cell className="w-9 py-2.5 pr-0 pl-3.5">
                  <FieldGlyph field={field} primaryKey={primaryKey} />
                </Table.Cell>
                <Table.Cell
                  textValue={field.name}
                  className="py-2.5 font-mono text-code font-semibold whitespace-nowrap"
                >
                  <MarkedText text={field.name} query={query} />
                  {field.dbName ? (
                    <span className="mt-0.5 block text-meta font-normal text-faint">
                      {field.dbName}
                    </span>
                  ) : null}
                </Table.Cell>
                <Table.Cell textValue={fieldTypeLabel(field)} className="py-2.5">
                  <TypeLink field={field} schema={schema} />
                </Table.Cell>
                <Table.Cell textValue={field.attributes.join(' ')} className="py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {field.attributes.map((attribute) => (
                      <Chip
                        key={attribute}
                        color="accent"
                        variant="soft"
                        size="sm"
                        className="font-mono"
                      >
                        {attribute}
                      </Chip>
                    ))}
                  </div>
                </Table.Cell>
                <Table.Cell
                  textValue={field.documentation ?? ''}
                  className="max-w-[420px] py-2.5 text-muted"
                >
                  {field.documentation === null ? (
                    <span className="text-faint">—</span>
                  ) : (
                    <MarkedText text={field.documentation} query={query} />
                  )}
                  {field.annotations.length > 0 ? (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {field.annotations.map((annotation) => (
                        <code key={annotation} className="text-meta text-faint">
                          {annotation}
                        </code>
                      ))}
                    </div>
                  ) : null}
                </Table.Cell>
                <Table.Cell className="w-9">
                  <CopyButton text={field.name} what={`field ${field.name}`} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  )
}
