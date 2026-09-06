import { buttonVariants, Table } from '@heroui/react'
import { Link } from '@tanstack/react-router'
import { LuFileText } from 'react-icons/lu'

import { CopyButton } from '../../components/copy-button.js'

type Schema = {
  readonly models: readonly {
    readonly name: string
    readonly fields: readonly {
      readonly name: string
      readonly kind: string
      readonly type: string
    }[]
  }[]
}

type Enum = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation: string | null
  readonly values: readonly { readonly name: string; readonly dbName: string | null }[]
}

export function EnumView({ schema, value }: { readonly schema: Schema; readonly value: Enum }) {
  const usedBy = schema.models.flatMap((model) =>
    model.fields
      .filter((f) => f.kind === 'enum' && f.type === value.name)
      .map((f) => ({ model: model.name, field: f.name })),
  )
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-auto">
      <header className="sticky top-0 z-[2] flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3.5">
        <h1 className="page-title">{value.name}</h1>
        {value.dbName ? <span className="font-mono text-ui text-muted">{value.dbName}</span> : null}
        <span className="text-lead text-muted">
          enum · {value.values.length} {value.values.length === 1 ? 'value' : 'values'}
        </span>
        <Link
          className={buttonVariants({ variant: 'ghost' })}
          to="/prisma"
          search={{ focus: value.name }}
        >
          <LuFileText size={15} />
          Prisma schema
        </Link>
      </header>
      {value.documentation ? (
        <p className="m-0 px-6 pt-3 whitespace-pre-wrap text-muted">{value.documentation}</p>
      ) : null}
      <Table variant="secondary" className="studio-table">
        <Table.ScrollContainer className="overflow-auto">
          <Table.Content aria-label={`${value.name} values`}>
            <Table.Header>
              <Table.Column isRowHeader>Value</Table.Column>
              <Table.Column>Database value</Table.Column>
              <Table.Column className="w-9" aria-label="Copy" />
            </Table.Header>
            <Table.Body>
              {value.values.map((item) => (
                <Table.Row key={item.name} id={item.name}>
                  <Table.Cell className="py-2.5 font-mono text-code">{item.name}</Table.Cell>
                  <Table.Cell className="py-2.5 font-mono text-code text-muted">
                    {item.dbName ?? item.name}
                  </Table.Cell>
                  <Table.Cell className="w-9">
                    <CopyButton text={item.name} what={`value ${item.name}`} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <div className="px-6 py-4">
        <div className="heading">Used by · {usedBy.length}</div>
        {usedBy.length === 0 ? <div className="text-muted">Not referenced by any model</div> : null}
        {usedBy.map((use) => (
          <div key={`${use.model}.${use.field}`} className="mb-1.5 font-mono text-code">
            <Link
              className="font-semibold text-accent-text hover:underline"
              to="/models/$name"
              params={{ name: use.model }}
              search={{}}
            >
              {use.model}
            </Link>
            .{use.field}
          </div>
        ))}
      </div>
    </section>
  )
}
