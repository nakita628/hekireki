import type { FC } from 'hono/jsx'
import type { DMMF } from '@prisma/generator-helper'
import type { DMMFDocument, DMMFMapping } from './transformDMMF.js'
import {
  tocSectionClass,
  tocSubHeaderClass,
  tocSubSectionClass,
  tocSubSectionTitleClass,
  tocListClass,
  tocLinkClass,
  tocHeadingClass,
  listItemClass,
} from '../styles.js'

type TOCStructure = {
  readonly models: readonly TOCModel[]
  readonly types: TOCTypes
}

type TOCModel = {
  readonly name: string
  readonly fields: readonly string[]
  readonly operations: readonly string[]
}

type TOCTypes = {
  readonly inputTypes: readonly string[]
  readonly outputTypes: readonly string[]
}

const TOCSubHeader: FC<{ name: string }> = ({ name }) => (
  <div class={tocSubHeaderClass}>
    <a href={`#model-${name}`} class={tocLinkClass}>
      {name}
    </a>
  </div>
)

const TOCSubField: FC<{ identifier: string; root: string; field: string }> = ({
  identifier,
  root,
  field,
}) => (
  <li>
    <a href={`#${identifier}-${root}-${field}`} class={tocLinkClass}>
      {field}
    </a>
  </li>
)

const TOCModelItem: FC<{ model: TOCModel }> = ({ model }) => (
  <li class={listItemClass}>
    <TOCSubHeader name={model.name} />
    <div class={tocSubSectionClass}>
      <div class={tocSubSectionTitleClass}>
        <a href={`#model-${model.name}-fields`} class={tocLinkClass}>
          Fields
        </a>
      </div>
      <ul class={tocListClass}>
        {model.fields.map((field) => (
          <TOCSubField identifier="model" root={model.name} field={field} />
        ))}
      </ul>
    </div>
    <div class={tocSubSectionClass}>
      <div class={tocSubSectionTitleClass}>
        <a href={`#model-${model.name}-operations`} class={tocLinkClass}>
          Operations
        </a>
      </div>
      <ul class={tocListClass}>
        {model.operations.map((op) => (
          <TOCSubField identifier="model" root={model.name} field={op} />
        ))}
      </ul>
    </div>
  </li>
)

const TOCTypeSection: FC<{ title: string; href: string; types: readonly string[]; kind: string }> = ({
  title,
  href,
  types,
  kind,
}) => (
  <li class={listItemClass}>
    <div class={tocSubHeaderClass}>
      <a href={href} class={tocLinkClass}>
        {title}
      </a>
    </div>
    <ul class={tocListClass}>
      {types.map((type) => (
        <TOCSubField identifier="type" root={kind} field={type} />
      ))}
    </ul>
  </li>
)

const TOCComponent: FC<{ data: TOCStructure }> = ({ data }) => (
  <div>
    <h5 class={tocHeadingClass}>
      <a href="#models" class={tocLinkClass}>
        Models
      </a>
    </h5>
    <ul class={tocSectionClass}>
      {data.models.map((model) => (
        <TOCModelItem model={model} />
      ))}
    </ul>
    <h5 class={tocHeadingClass}>
      <a href="#types" class={tocLinkClass}>
        Types
      </a>
    </h5>
    <ul class={tocSectionClass}>
      <TOCTypeSection
        title="Input Types"
        href="#input-types"
        types={data.types.inputTypes}
        kind="inputType"
      />
      <TOCTypeSection
        title="Output Types"
        href="#output-types"
        types={data.types.outputTypes}
        kind="outputType"
      />
    </ul>
  </div>
)

const getModels = (dmmfModel: readonly DMMF.Model[], mappings: readonly DMMFMapping[]): readonly TOCModel[] =>
  dmmfModel.map((model) => ({
    name: model.name,
    fields: model.fields.map((field) => field.name),
    operations: Object.keys(mappings.find((x) => x.model === model.name) ?? {}).filter(
      (op) => op !== 'model',
    ),
  }))

const getTypes = (dmmfSchema: DMMF.Schema): TOCTypes => {
  const prismaInputTypes = dmmfSchema.inputObjectTypes.prisma ?? []
  return {
    inputTypes: prismaInputTypes.map((inputType) => inputType.name),
    outputTypes: [
      ...dmmfSchema.outputObjectTypes.model.map((ot) => ot.name),
      ...dmmfSchema.outputObjectTypes.prisma
        .map((outputType) => outputType.name)
        .filter((ot) => ot !== 'Query' && ot !== 'Mutation'),
    ],
  }
}

const getTOCData = (d: DMMFDocument): TOCStructure => ({
  models: getModels([...d.datamodel.models], d.mappings),
  types: getTypes(d.schema),
})

export const createTOC = (d: DMMFDocument) => {
  const data = getTOCData(d)
  return <TOCComponent data={data} />
}
