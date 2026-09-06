import { Link } from '@tanstack/react-router'
import { LuArrowRight } from 'react-icons/lu'

import { FieldGlyph } from './fields-table.js'
import { fieldTypeLabel } from './labels.js'

type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

type Model = {
  readonly name: string
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly {
    readonly name: string
    readonly type: string
    readonly isList: boolean
    readonly isRequired: boolean
    readonly isId: boolean
    readonly isForeignKey: boolean
    readonly documentation: string | null
    readonly attributes: readonly string[]
  }[]
  readonly indexes: readonly { readonly attribute: string }[]
  readonly attributes: readonly string[]
  readonly annotations: readonly string[]
}

type Schema = {
  readonly relations: readonly {
    readonly id: string
    readonly origin: 'inferred' | 'annotated' | 'implicit-many-to-many'
    readonly onDelete: string | null
    readonly from: {
      readonly model: string
      readonly field: string
      readonly cardinality: Cardinality
    }
    readonly to: {
      readonly model: string
      readonly field: string
      readonly cardinality: Cardinality
    }
  }[]
}

const ATTRIBUTE = 'pl-5 font-mono text-code break-all text-accent-text'

const CARDINALITY_LABELS = {
  'zero-one': '0..1',
  one: '1',
  'zero-many': '0..N',
  many: '1..N',
} as const

export function DetailsPanel({
  schema,
  model,
}: {
  readonly schema: Schema
  readonly model: Model
}) {
  const primaryKey = new Set(model.primaryKey)
  const relations = schema.relations.filter(
    (r) => r.from.model === model.name || r.to.model === model.name,
  )
  const indexAttributes = new Set(model.indexes.map((i) => i.attribute))
  const modelAttributes = model.attributes.filter((a) => !indexAttributes.has(a))
  return (
    <aside className="overflow-y-auto border-l border-line bg-surface px-5 pt-4 pb-6 text-body">
      <div className="mb-[22px]">
        <div className="heading">Fields · {model.fields.length}</div>
        {model.fields.map((field) => (
          <div key={field.name} className="mb-3">
            <div className="flex items-center gap-1.5">
              <FieldGlyph field={field} primaryKey={primaryKey} />
              <span className="font-mono text-body font-semibold">{field.name}</span>
              <span className="font-mono text-code text-muted">{fieldTypeLabel(field)}</span>
            </div>
            {field.attributes.map((a) => (
              <div key={a} className={ATTRIBUTE}>
                {a}
              </div>
            ))}
            {field.documentation ? (
              <div className="pl-5 whitespace-pre-wrap text-muted">{field.documentation}</div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mb-[22px]">
        <div className="heading">Relations · {relations.length}</div>
        {relations.length === 0 ? <div className="text-muted">No relations</div> : null}
        {relations.map((relation) => {
          const outgoing = relation.from.model === model.name
          const other = outgoing ? relation.to : relation.from
          return (
            <div
              key={relation.id}
              className="mb-1.5 flex flex-wrap items-center gap-1 font-mono text-code"
            >
              <Link
                className="font-semibold text-accent-text hover:underline"
                to="/models/$name"
                params={{ name: other.model }}
                search={{}}
              >
                {other.model}
              </Link>
              .{other.field}
              <LuArrowRight size={12} className="text-faint" />
              {outgoing ? relation.from.field : relation.to.field}
              <span className="text-muted">
                {' · '}
                {CARDINALITY_LABELS[outgoing ? relation.from.cardinality : relation.to.cardinality]}
                {' → '}
                {CARDINALITY_LABELS[other.cardinality]}
              </span>
              {relation.onDelete ? (
                <span className="text-muted"> · onDelete: {relation.onDelete}</span>
              ) : null}
              {relation.origin === 'implicit-many-to-many' ? (
                <span className="text-muted"> · many-to-many</span>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="mb-[22px]">
        <div className="heading">Indexes · {model.indexes.length}</div>
        {model.indexes.length === 0 ? (
          <div className="text-muted">No block-level indexes</div>
        ) : null}
        {model.indexes.map((index) => (
          <div key={index.attribute} className={ATTRIBUTE}>
            {index.attribute}
          </div>
        ))}
      </div>
      {modelAttributes.length > 0 ? (
        <div className="mb-[22px]">
          <div className="heading">Attributes · {modelAttributes.length}</div>
          {modelAttributes.map((a) => (
            <div key={a} className={ATTRIBUTE}>
              {a}
            </div>
          ))}
        </div>
      ) : null}
      {model.annotations.length > 0 ? (
        <div className="mb-[22px]">
          <div className="heading">Annotations · {model.annotations.length}</div>
          {model.annotations.map((a) => (
            <div key={a} className={ATTRIBUTE}>
              {a}
            </div>
          ))}
        </div>
      ) : null}
      <Link
        className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline"
        to="/prisma"
        search={{ focus: model.name }}
      >
        Open the Prisma schema <LuArrowRight size={13} />
      </Link>
    </aside>
  )
}
