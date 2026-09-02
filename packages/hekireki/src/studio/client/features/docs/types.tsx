import { Fragment } from 'react'
import type * as z from 'zod'

import type { DocsSchema } from '../../../server/routes/index.js'
import { isScalarType } from './scalar.js'

// The wire shape: the brand the server puts on checked Docs does not survive JSON.
type Docs = z.input<typeof DocsSchema>
type DocsType = Docs['inputTypes'][number]
type Kind = 'inputType' | 'outputType'

const CELL = 'border-b border-line px-3.5 py-2.5 align-top text-[13px]'

function TypeRef({
  typeRef,
  kind,
}: {
  readonly typeRef: DocsType['fields'][number]['types'][number]
  readonly kind: Kind
}) {
  const label = `${typeRef.type}${typeRef.isList ? '[]' : ''}`
  if (isScalarType(typeRef.type)) return <span className="font-mono text-[12.5px]">{label}</span>
  return (
    <a
      className="font-mono text-[12.5px] font-semibold text-accent-text hover:underline"
      href={`#type-${kind}-${typeRef.type}`}
    >
      {label}
    </a>
  )
}

function TypeSection({ type, kind }: { readonly type: DocsType; readonly kind: Kind }) {
  return (
    <section
      id={`type-${kind}-${type.name}`}
      className="scroll-mt-4 border-b border-line px-6 py-5"
    >
      <h3 className="m-0 pb-2 font-mono text-[15px] font-bold">{type.name}</h3>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="th">Name</th>
            <th className="th">Type</th>
            <th className="th">Nullable</th>
          </tr>
        </thead>
        <tbody>
          {type.fields.map((field) => (
            <tr key={field.name}>
              <td className={`${CELL} font-mono font-semibold whitespace-nowrap`}>{field.name}</td>
              <td className={CELL}>
                {field.types.map((typeRef, index) => (
                  <Fragment key={`${typeRef.type}${typeRef.isList ? '[]' : ''}`}>
                    {index > 0 && <span className="text-faint"> | </span>}
                    <TypeRef typeRef={typeRef} kind={kind} />
                  </Fragment>
                ))}
              </td>
              <td className={CELL}>{field.nullable ? <strong>Yes</strong> : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** The Types section: the input types, then the output types of the Prisma client API. */
export function Types({ docs }: { readonly docs: Docs }) {
  return (
    <div>
      <h1
        id="types"
        className="m-0 scroll-mt-4 border-b border-line px-6 py-5 text-[22px] font-bold tracking-tight"
      >
        Types
      </h1>
      <h2
        id="input-types"
        className="m-0 scroll-mt-4 border-b border-line px-6 py-4 text-lg font-bold"
      >
        Input Types · {docs.inputTypes.length}
      </h2>
      {docs.inputTypes.map((type) => (
        <TypeSection key={type.name} type={type} kind="inputType" />
      ))}
      <h2
        id="output-types"
        className="m-0 scroll-mt-4 border-b border-line px-6 py-4 text-lg font-bold"
      >
        Output Types · {docs.outputTypes.length}
      </h2>
      {docs.outputTypes.map((type) => (
        <TypeSection key={type.name} type={type} kind="outputType" />
      ))}
    </div>
  )
}
