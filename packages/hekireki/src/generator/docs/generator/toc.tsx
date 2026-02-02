import type { FC } from 'hono/jsx'
import type { DMMF } from '@prisma/generator-helper'
import type { DMMFDocument, DMMFMapping } from './transformDMMF.js'
import { styles } from '../styles.js'

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
  <div class={styles.tocSubHeader}>
    <a href={`#model-${name}`} class={styles.tocLink}>
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
    <a href={`#${identifier}-${root}-${field}`} class={styles.tocLink}>
      {field}
    </a>
  </li>
)

const TOCModelItem: FC<{ model: TOCModel }> = ({ model }) => (
  <li class={styles.listItem}>
    <TOCSubHeader name={model.name} />
    <div class={styles.tocSubSection}>
      <div class={styles.tocSubSectionTitle}>
        <a href={`#model-${model.name}-fields`} class={styles.tocLink}>
          Fields
        </a>
      </div>
      <ul class={styles.tocList}>
        {model.fields.map((field) => (
          <TOCSubField identifier="model" root={model.name} field={field} />
        ))}
      </ul>
    </div>
    <div class={styles.tocSubSection}>
      <div class={styles.tocSubSectionTitle}>
        <a href={`#model-${model.name}-operations`} class={styles.tocLink}>
          Operations
        </a>
      </div>
      <ul class={styles.tocList}>
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
  <li class={styles.listItem}>
    <div class={styles.tocSubHeader}>
      <a href={href} class={styles.tocLink}>
        {title}
      </a>
    </div>
    <ul class={styles.tocList}>
      {types.map((type) => (
        <TOCSubField identifier="type" root={kind} field={type} />
      ))}
    </ul>
  </li>
)

const TOCComponent: FC<{ data: TOCStructure }> = ({ data }) => (
  <div>
    <h5 class={styles.tocHeading}>
      <a href="#models" class={styles.tocLink}>
        Models
      </a>
    </h5>
    <ul class={styles.tocSection}>
      {data.models.map((model) => (
        <TOCModelItem model={model} />
      ))}
    </ul>
    <h5 class={styles.tocHeading}>
      <a href="#types" class={styles.tocLink}>
        Types
      </a>
    </h5>
    <ul class={styles.tocSection}>
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
