import { typeSectionId } from './anchors.js'

type Docs = {
  readonly models: readonly {
    readonly name: string
    readonly fields: readonly { readonly name: string }[]
    readonly operations: readonly { readonly name: string }[]
  }[]
  readonly inputTypes: readonly { readonly name: string }[]
  readonly outputTypes: readonly { readonly name: string }[]
  readonly enumTypes: readonly { readonly name: string }[]
}

function TocList({
  items,
  hrefOf,
}: {
  readonly items: readonly string[]
  readonly hrefOf: (item: string) => string
}) {
  return (
    <ul className="m-0 ml-1 list-none border-l-2 border-line py-0.5 pl-3">
      {items.map((item) => (
        <li key={item}>
          <a
            className="block truncate py-0.5 font-mono text-code hover:underline"
            href={hrefOf(item)}
          >
            {item}
          </a>
        </li>
      ))}
    </ul>
  )
}

function TocModel({ model }: { readonly model: Docs['models'][number] }) {
  return (
    <li className="mb-3">
      <a
        className="block font-mono text-body font-semibold hover:underline"
        href={`#model-${model.name}`}
      >
        {model.name}
      </a>
      <div className="mt-1 ml-2">
        <a
          className="text-code font-medium text-muted hover:underline"
          href={`#model-${model.name}-fields`}
        >
          Fields
        </a>
        <TocList
          items={model.fields.map((f) => f.name)}
          hrefOf={(f) => `#model-${model.name}-${f}`}
        />
      </div>
      <div className="mt-1 ml-2">
        <a
          className="text-code font-medium text-muted hover:underline"
          href={`#model-${model.name}-operations`}
        >
          Operations
        </a>
        <TocList
          items={model.operations.map((op) => op.name)}
          hrefOf={(op) => `#model-${model.name}-${op}`}
        />
      </div>
    </li>
  )
}

/** The table of contents: every model with its fields and operations, then the client API types and enums. */
export function Toc({ docs }: { readonly docs: Docs }) {
  return (
    <nav className="sticky top-0 hidden max-h-full w-64 shrink-0 overflow-y-auto border-r border-line px-4 py-5 lg:block">
      <div className="heading pb-1.5">
        <a className="hover:underline" href="#models">
          Models
        </a>
      </div>
      <ul className="m-0 mb-4 list-none p-0">
        {docs.models.map((model) => (
          <TocModel key={model.name} model={model} />
        ))}
      </ul>
      <div className="heading pb-1.5">
        <a className="hover:underline" href="#types">
          Types
        </a>
      </div>
      <ul className="m-0 list-none p-0">
        <li className="mb-3">
          <a
            className="block font-mono text-body font-semibold hover:underline"
            href="#input-types"
          >
            Input Types
          </a>
          <TocList
            items={docs.inputTypes.map((t) => t.name)}
            hrefOf={(t) => `#${typeSectionId('inputType', t)}`}
          />
        </li>
        <li className="mb-3">
          <a
            className="block font-mono text-body font-semibold hover:underline"
            href="#output-types"
          >
            Output Types
          </a>
          <TocList
            items={docs.outputTypes.map((t) => t.name)}
            hrefOf={(t) => `#${typeSectionId('outputType', t)}`}
          />
        </li>
        <li className="mb-3">
          <a className="block font-mono text-body font-semibold hover:underline" href="#enum-types">
            Enum Types
          </a>
          <TocList
            items={docs.enumTypes.map((t) => t.name)}
            hrefOf={(t) => `#${typeSectionId('enum', t)}`}
          />
        </li>
      </ul>
    </nav>
  )
}
