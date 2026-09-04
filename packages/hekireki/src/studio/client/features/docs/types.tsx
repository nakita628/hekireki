import { Fragment } from 'react'

import { typeRefAnchor, typeSectionId } from './anchors.js'
import { TypeLink } from './type-link.js'

type DocsTypeRef = {
  readonly type: string
  readonly isList: boolean
  readonly location:
    | 'scalar'
    | 'inputObjectTypes'
    | 'outputObjectTypes'
    | 'enumTypes'
    | 'fieldRefTypes'
}

type DocsType = {
  readonly name: string
  readonly fields: readonly {
    readonly name: string
    readonly types: readonly DocsTypeRef[]
    readonly nullable: boolean
  }[]
}

type DocsEnum = { readonly name: string; readonly values: readonly string[] }

type Docs = {
  readonly inputTypes: readonly DocsType[]
  readonly outputTypes: readonly DocsType[]
  readonly enumTypes: readonly DocsEnum[]
}

type Kind = 'inputType' | 'outputType'

const CELL = 'border-b border-line px-3.5 py-2.5 align-top text-body'

function TypeSection({ type, kind }: { readonly type: DocsType; readonly kind: Kind }) {
  return (
    <section
      id={typeSectionId(kind, type.name)}
      className="scroll-mt-4 border-b border-line px-6 py-5"
    >
      <h3 className="m-0 pb-2 font-mono text-lead font-bold">{type.name}</h3>
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
                    <TypeLink
                      href={typeRefAnchor(typeRef)}
                      label={`${typeRef.type}${typeRef.isList ? '[]' : ''}`}
                    />
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

function EnumSection({ type }: { readonly type: DocsEnum }) {
  return (
    <section
      id={typeSectionId('enum', type.name)}
      className="scroll-mt-4 border-b border-line px-6 py-5"
    >
      <h3 className="m-0 pb-2 font-mono text-lead font-bold">{type.name}</h3>
      <div className="flex flex-wrap gap-1.5">
        {type.values.map((value) => (
          <span key={value} className="chip">
            {value}
          </span>
        ))}
      </div>
    </section>
  )
}

function GroupHeading({
  id,
  children,
}: {
  readonly id: string
  readonly children: React.ReactNode
}) {
  return (
    <h2 id={id} className="m-0 scroll-mt-4 border-b border-line px-6 py-4 text-section font-bold">
      {children}
    </h2>
  )
}

/** The Types section: the input types, the output types, then the enums of the Prisma client API. */
export function Types({ docs }: { readonly docs: Docs }) {
  return (
    <div>
      <h1 id="types" className="page-title scroll-mt-4 border-b border-line px-6 py-5">
        Types
      </h1>
      <GroupHeading id="input-types">Input Types · {docs.inputTypes.length}</GroupHeading>
      {docs.inputTypes.map((type) => (
        <TypeSection key={type.name} type={type} kind="inputType" />
      ))}
      <GroupHeading id="output-types">Output Types · {docs.outputTypes.length}</GroupHeading>
      {docs.outputTypes.map((type) => (
        <TypeSection key={type.name} type={type} kind="outputType" />
      ))}
      <GroupHeading id="enum-types">Enum Types · {docs.enumTypes.length}</GroupHeading>
      {docs.enumTypes.map((type) => (
        <EnumSection key={type.name} type={type} />
      ))}
    </div>
  )
}
