import { Fragment } from 'react'
import type * as z from 'zod'

import { CodeBlock } from '@/components/code-block.js'

import type { DocsSchema } from '../../../server/routes/index.js'
import { isScalarType } from './scalar.js'

// The wire shape: the brand the server puts on checked Docs does not survive JSON.
type Docs = z.input<typeof DocsSchema>
type DocsModel = Docs['models'][number]

const CELL = 'border-b border-line px-3.5 py-2.5 align-top text-[13px]'
const LINK = 'font-mono text-[12.5px] font-semibold text-accent-text hover:underline'

function TypeRef({
  typeRef,
  kind,
}: {
  readonly typeRef: { readonly type: string; readonly isList: boolean }
  readonly kind: 'inputType' | 'outputType'
}) {
  const label = `${typeRef.type}${typeRef.isList ? '[]' : ''}`
  if (isScalarType(typeRef.type)) return <span className="font-mono text-[12.5px]">{label}</span>
  return (
    <a className={LINK} href={`#type-${kind}-${typeRef.type}`}>
      {label}
    </a>
  )
}

function FieldRow({
  field,
  modelName,
}: {
  readonly field: DocsModel['fields'][number]
  readonly modelName: string
}) {
  return (
    <tr id={`model-${modelName}-${field.name}`} className="scroll-mt-4">
      <td className={`${CELL} font-mono font-semibold whitespace-nowrap`}>{field.name}</td>
      <td className={CELL}>
        {isScalarType(field.bareTypeName) ? (
          <span className="font-mono text-[12.5px]">{field.type}</span>
        ) : (
          <a className={LINK} href={`#type-outputType-${field.bareTypeName}`}>
            {field.type}
          </a>
        )}
      </td>
      <td className={CELL}>
        <div className="flex flex-wrap gap-1">
          {field.directives.length > 0 ? (
            field.directives.map((directive) => (
              <span key={directive} className="chip">
                {directive}
              </span>
            ))
          ) : (
            <span className="text-faint">—</span>
          )}
        </div>
      </td>
      <td className={CELL}>{field.required ? <strong>Yes</strong> : 'No'}</td>
      <td className={`${CELL} max-w-[420px] text-muted`}>
        {field.documentation ?? <span className="text-faint">—</span>}
      </td>
    </tr>
  )
}

function Operation({
  operation,
  modelName,
}: {
  readonly operation: DocsModel['operations'][number]
  readonly modelName: string
}) {
  return (
    <div id={`model-${modelName}-${operation.name}`} className="scroll-mt-4 pt-4">
      <h4 className="m-0 font-mono text-[15px] font-bold">{operation.name}</h4>
      <p className="m-0 pt-1 pb-3 text-muted">{operation.description}</p>
      <CodeBlock code={operation.usage} />
      <div className="heading pt-4 pb-1.5">Input</div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="th">Name</th>
            <th className="th">Type</th>
            <th className="th">Required</th>
          </tr>
        </thead>
        <tbody>
          {(operation.inputs ?? []).map((input) => (
            <tr key={input.name}>
              <td className={`${CELL} font-mono font-semibold whitespace-nowrap`}>{input.name}</td>
              <td className={CELL}>
                {input.types.map((typeRef, index) => (
                  <Fragment key={`${typeRef.type}${typeRef.isList ? '[]' : ''}`}>
                    {index > 0 && <span className="text-faint"> | </span>}
                    <TypeRef typeRef={typeRef} kind="inputType" />
                  </Fragment>
                ))}
              </td>
              <td className={CELL}>{input.required ? <strong>Yes</strong> : 'No'}</td>
            </tr>
          ))}
          {(operation.inputs ?? []).length === 0 ? (
            <tr>
              <td colSpan={3} className={`${CELL} text-faint`}>
                No arguments
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div className="heading pt-4 pb-1.5">Output</div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className="font-semibold">Type</dt>
        <dd className="m-0">
          {operation.output.type === null ? (
            <span className="text-faint">—</span>
          ) : (
            <TypeRef typeRef={{ type: operation.output.type, isList: false }} kind="outputType" />
          )}
        </dd>
        <dt className="font-semibold">Required</dt>
        <dd className="m-0">{operation.output.required ? 'Yes' : 'No'}</dd>
        <dt className="font-semibold">List</dt>
        <dd className="m-0">{operation.output.list ? 'Yes' : 'No'}</dd>
      </dl>
    </div>
  )
}

function ModelSection({ model }: { readonly model: DocsModel }) {
  return (
    <section id={`model-${model.name}`} className="scroll-mt-4 border-b border-line px-6 py-6">
      <h2 className="m-0 font-mono text-xl font-bold tracking-tight">{model.name}</h2>
      {model.documentation ? (
        <p className="m-0 pt-2 whitespace-pre-wrap text-muted">{model.documentation}</p>
      ) : null}
      {model.directives.length > 0 ? (
        <table className="mt-3 border-collapse">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Value</th>
            </tr>
          </thead>
          <tbody>
            {model.directives.map((directive) => (
              <tr key={`${directive.name}-${directive.values.join(',')}`}>
                <td className={`${CELL} font-mono font-semibold`}>{directive.name}</td>
                <td className={`${CELL} font-mono`}>{directive.values.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <h3 id={`model-${model.name}-fields`} className="heading scroll-mt-4 pt-5 pb-1.5">
        Fields
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Type</th>
              <th className="th">Attributes</th>
              <th className="th">Required</th>
              <th className="th">Comment</th>
            </tr>
          </thead>
          <tbody>
            {model.fields.map((field) => (
              <FieldRow key={field.name} field={field} modelName={model.name} />
            ))}
          </tbody>
        </table>
      </div>
      <h3 id={`model-${model.name}-operations`} className="heading scroll-mt-4 pt-5">
        Operations
      </h3>
      <div className="divide-y divide-line">
        {model.operations.map((operation) => (
          <Operation key={operation.name} operation={operation} modelName={model.name} />
        ))}
      </div>
    </section>
  )
}

/** The Models section: every model with its attributes, fields and Prisma client operations. */
export function Models({ docs }: { readonly docs: Docs }) {
  return (
    <div>
      <h1
        id="models"
        className="m-0 scroll-mt-4 border-b border-line px-6 py-5 text-[22px] font-bold tracking-tight"
      >
        Models
      </h1>
      {docs.models.map((model) => (
        <ModelSection key={model.name} model={model} />
      ))}
    </div>
  )
}
