import type { FC } from 'hono/jsx'
import type { DMMF } from '@prisma/generator-helper'
import type { Generatable } from './helpers.js'
import type { DMMFDocument, DMMFMapping } from './transformDMMF.js'
import { styles } from '../styles.js'

type TOCStructure = {
  models: TOCModel[]
  types: TOCTypes
}

type TOCModel = {
  name: string
  fields: string[]
  operations: string[]
}

type TOCTypes = {
  inputTypes: string[]
  outputTypes: string[]
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

const TOCTypeSection: FC<{ title: string; href: string; types: string[]; kind: string }> = ({
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

export class TOCGenerator implements Generatable<TOCStructure> {
  data: TOCStructure

  constructor(d: DMMFDocument) {
    this.data = this.getData(d)
  }

  toHTML(): string {
    return this.toJSX().toString()
  }

  toJSX(): JSX.Element {
    return <TOCComponent data={this.data} />
  }

  private getModels(dmmfModel: DMMF.Model[], mappings: DMMFMapping[]): TOCModel[] {
    return dmmfModel.map((model) => ({
      name: model.name,
      fields: model.fields.map((field) => field.name),
      operations: Object.keys(mappings.find((x) => x.model === model.name) ?? {}).filter(
        (op) => op !== 'model',
      ),
    }))
  }

  private getTypes(dmmfSchema: DMMF.Schema): TOCTypes {
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

  getData(d: DMMFDocument): TOCStructure {
    return {
      models: this.getModels([...d.datamodel.models], d.mappings),
      types: this.getTypes(d.schema),
    }
  }
}
