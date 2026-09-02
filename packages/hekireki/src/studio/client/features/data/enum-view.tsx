import { Link } from '@tanstack/react-router'

import type { Enum, Schema } from '../../../server/routes/index.js'
import { FileIcon } from '../../components/icons.js'

export function EnumView({ schema, value }: { readonly schema: Schema; readonly value: Enum }) {
  const usedBy = schema.models.flatMap((model) =>
    model.fields
      .filter((f) => f.kind === 'enum' && f.type === value.name)
      .map((f) => ({ model: model.name, field: f.name })),
  )
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-auto">
      <header className="sticky top-0 z-[2] flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3.5">
        <h1 className="m-0 text-[22px] font-bold tracking-tight">{value.name}</h1>
        {value.dbName ? <span className="font-mono text-sm text-muted">{value.dbName}</span> : null}
        <span className="text-[15px] text-muted">
          enum · {value.values.length} {value.values.length === 1 ? 'value' : 'values'}
        </span>
        <Link className="btn btn-ghost" to="/prisma" search={{ focus: value.name }}>
          <FileIcon size={15} />
          Prisma schema
        </Link>
      </header>
      {value.documentation ? (
        <p className="m-0 px-6 pt-3 whitespace-pre-wrap text-muted">{value.documentation}</p>
      ) : null}
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 border-b border-line bg-surface-2 px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-muted">
                Value
              </th>
              <th className="sticky top-0 border-b border-line bg-surface-2 px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-muted">
                Database value
              </th>
            </tr>
          </thead>
          <tbody>
            {value.values.map((item) => (
              <tr key={item.name}>
                <td className="border-b border-line px-3.5 py-2.5 font-mono text-[12.5px]">
                  {item.name}
                </td>
                <td className="border-b border-line px-3.5 py-2.5 font-mono text-[12.5px] text-muted">
                  {item.dbName ?? item.name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-4">
        <div className="heading">Used by · {usedBy.length}</div>
        {usedBy.length === 0 ? <div className="text-muted">Not referenced by any model</div> : null}
        {usedBy.map((use) => (
          <div key={`${use.model}.${use.field}`} className="mb-1.5 font-mono text-[12.5px]">
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
