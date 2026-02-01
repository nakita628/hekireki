import type { FC } from 'hono/jsx'
import type { DMMF } from '@prisma/generator-helper'
import { capitalize, type Generatable, isScalarType, lowerCase } from './helpers.js'
import type { DMMFDocument, DMMFMapping } from './transformDMMF.js'
import { styles } from '../styles.js'

// Model action string literals (avoiding runtime DMMF usage)
const ModelAction = {
  create: 'create',
  deleteMany: 'deleteMany',
  delete: 'delete',
  findMany: 'findMany',
  findUnique: 'findUnique',
  findFirst: 'findFirst',
  update: 'update',
  updateMany: 'updateMany',
  upsert: 'upsert',
} as const

type ModelGeneratorStructure = {
  models: MGModel[]
}

type MGModel = {
  documentation?: string
  name: string
  directives: MGModelDirective[]
  fields: MGModelField[]
  operations: MGModelOperation[]
}

type MGModelDirective = {
  name: string
  values: readonly string[]
}

type MGModelField = {
  name: string
  type: string
  bareTypeName: string
  directives: string[]
  documentation?: string
  required: boolean
}

type MGModelOperationKeys = {
  name: string
  types: readonly DMMF.InputTypeRef[]
  required: boolean
}

type MGModelOperationOutput = {
  type: string
  required: boolean
  list: boolean
}

type MakeOptionallyUndefined<T> = {
  [k in keyof T]: T[k] | undefined
}

type MGModelOperation = {
  name: string
  description: string
  opKeys: MGModelOperationKeys[] | undefined
  usage: string
  output: MakeOptionallyUndefined<MGModelOperationOutput>
}

interface FieldDefault {
  name: string
  args: any[]
}

const fieldDirectiveMap = new Map<string, string>([
  ['isUnique', '@unique'],
  ['isId', '@id'],
  ['hasDefaultValue', '@default'],
  ['isUpdatedAt', '@updatedAt'],
])

const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

// Components
const DirectiveRow: FC<{ directive: MGModelDirective }> = ({ directive }) => (
  <tr>
    <td>
      <strong>{directive.name}</strong>
    </td>
    <td>
      <ul>
        {directive.values.map((val) => (
          <li>{val}</li>
        ))}
      </ul>
    </td>
  </tr>
)

const FieldTypeLink: FC<{ type: string; bareTypeName: string }> = ({ type, bareTypeName }) => {
  if (isScalarType(bareTypeName)) {
    return <>{type}</>
  }
  return <a href={`#type-outputType-${bareTypeName}`}>{type}</a>
}

const FieldTableRow: FC<{ field: MGModelField; modelName: string }> = ({ field, modelName }) => (
  <tr id={`model-${modelName}-${field.name}`}>
    <td>{field.name}</td>
    <td>
      <FieldTypeLink type={field.type} bareTypeName={field.bareTypeName} />
    </td>
    <td>
      <ul>
        {field.directives.length > 0 ? (
          field.directives.map((directive) => (
            <li>
              <strong>{directive}</strong>
            </li>
          ))
        ) : (
          <li> - </li>
        )}
      </ul>
    </td>
    <td>{field.required ? <strong>Yes</strong> : 'No'}</td>
    <td>{field.documentation ?? '-'}</td>
  </tr>
)

const OperationInputTypeLink: FC<{ typeRef: DMMF.InputTypeRef }> = ({ typeRef }) => {
  const typeName = typeRef.type as string
  if (isScalarType(typeName)) {
    return <>{typeName}</>
  }
  return (
    <a href={`#type-inputType-${typeName}`}>
      {typeName}
      {typeRef.isList ? '[]' : ''}
    </a>
  )
}

const OperationInputRow: FC<{ opKey: MGModelOperationKeys }> = ({ opKey }) => (
  <tr>
    <td>{opKey.name}</td>
    <td>
      {opKey.types.map((t, i) => (
        <>
          {i > 0 && ' | '}
          <OperationInputTypeLink typeRef={t} />
        </>
      ))}
    </td>
    <td>{opKey.required ? <strong>Yes</strong> : 'No'}</td>
  </tr>
)

const OperationMarkup: FC<{ operation: MGModelOperation; modelName: string }> = ({
  operation,
  modelName,
}) => (
  <div class={styles.operationItem}>
    <h4 id={`model-${modelName}-${operation.name}`} class={styles.h4}>
      {operation.name}
    </h4>
    <p class={styles.text}>{operation.description}</p>
    <div class={styles.mb2}>
      <pre class={styles.codeBlock}>
        <code>{operation.usage}</code>
      </pre>
    </div>
    <h4 class={styles.h4}>Input</h4>
    <table class={styles.table}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Required</th>
        </tr>
      </thead>
      <tbody>
        {operation.opKeys?.map((opK) => (
          <OperationInputRow opKey={opK} />
        ))}
      </tbody>
    </table>
    <h4 class={styles.h4}>Output</h4>
    <div class={styles.text}>
      <strong>Type: </strong>
      <a href={`#type-outputType-${operation.output.type}`}>{operation.output.type}</a>
    </div>
    <div class={styles.text}>
      <strong>Required: </strong>
      {operation.output.required ? 'Yes' : 'No'}
    </div>
    <div class={styles.text}>
      <strong>List: </strong>
      {operation.output.list ? 'Yes' : 'No'}
    </div>
  </div>
)

const ModelItem: FC<{ model: MGModel; isLast: boolean }> = ({ model, isLast }) => (
  <>
    <div class={styles.modelSection}>
      <h2 class={styles.h2} id={`model-${model.name}`}>
        {model.name}
      </h2>
      {model.documentation && <div class={styles.text}>Description: {model.documentation}</div>}
      {model.directives.length > 0 && (
        <table class={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {model.directives.map((directive) => (
              <DirectiveRow directive={directive} />
            ))}
          </tbody>
        </table>
      )}
      <div class={styles.fieldsSection}>
        <h3 class={styles.h3} id={`model-${model.name}-fields`}>
          Fields
        </h3>
        <div class={styles.ml4}>
          <table class={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Attributes</th>
                <th>Required</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {model.fields.map((field) => (
                <FieldTableRow field={field} modelName={model.name} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <hr class={styles.hr} />
      <div class={styles.operationsSection}>
        <h3 class={styles.h3} id={`model-${model.name}-operations`}>
          Operations
        </h3>
        <div class={styles.ml4}>
          {model.operations.map((op, i) => (
            <>
              {i > 0 && <hr class={styles.hrSmall} />}
              <OperationMarkup operation={op} modelName={model.name} />
            </>
          ))}
        </div>
      </div>
    </div>
    {!isLast && <hr class={styles.hr} />}
  </>
)

const ModelsSection: FC<{ data: ModelGeneratorStructure }> = ({ data }) => (
  <div class={styles.section}>
    <h1 class={styles.h1} id="models">
      Models
    </h1>
    {data.models.map((model, i) => (
      <ModelItem model={model} isLast={i === data.models.length - 1} />
    ))}
  </div>
)

export class ModelGenerator implements Generatable<ModelGeneratorStructure> {
  data: ModelGeneratorStructure

  constructor(d: DMMFDocument) {
    this.data = this.getData(d)
  }

  toHTML(): string {
    return this.toJSX().toString()
  }

  toJSX(): JSX.Element {
    return <ModelsSection data={this.data} />
  }

  private getModelDirective(model: DMMF.Model): MGModelDirective[] {
    const directiveValue: MGModelDirective[] = []

    if (model.primaryKey) {
      directiveValue.push({ name: '@@id', values: [...model.primaryKey.fields] })
    }

    if (model.uniqueFields.length > 0) {
      model.uniqueFields.forEach((uniqueField) => {
        directiveValue.push({ name: '@@unique', values: [...uniqueField] })
      })
    }

    if (model.uniqueIndexes.length > 0) {
      model.uniqueIndexes.forEach((uniqueIndex) => {
        directiveValue.push({ name: '@@index', values: [...uniqueIndex.fields] })
      })
    }

    return directiveValue
  }

  private getModelFields(model: DMMF.Model): MGModelField[] {
    return model.fields.map((field) => ({
      name: field.name,
      type: this.getFieldType(field),
      bareTypeName: field.type,
      documentation: (field as any).documentation,
      directives: this.getFieldDirectives(field),
      required: field.isRequired,
    }))
  }

  private getFieldType(field: DMMF.Field): string {
    let name = field.type
    if (!(field.isRequired || field.isList)) {
      name += '?'
    }
    if (field.isList) {
      name += '[]'
    }
    return name
  }

  private getFieldDirectives(field: DMMF.Field): string[] {
    const filteredEntries = Object.entries(field).filter(([_, v]) => Boolean(v))
    const directives: string[] = []

    filteredEntries.forEach(([k]) => {
      const mappedDirectiveValue = fieldDirectiveMap.get(k)
      if (mappedDirectiveValue) {
        if (k === 'hasDefaultValue' && field.default !== undefined) {
          if (
            typeof field.default === 'string' ||
            typeof field.default === 'number' ||
            typeof field.default === 'boolean'
          ) {
            directives.push(`${mappedDirectiveValue}(${field.default})`)
          } else if (Array.isArray(field.default)) {
            directives.push(`${mappedDirectiveValue}([${field.default.toString()}])`)
          } else if (typeof field.default === 'object') {
            directives.push(
              `${mappedDirectiveValue}(${(field.default as FieldDefault).name}(${(field.default as FieldDefault).args.join(',')}))`,
            )
          }
        } else {
          directives.push(mappedDirectiveValue)
        }
      }
    })

    return directives
  }

  private getModelOperations(
    model: DMMF.Model,
    mappings: DMMFMapping | undefined,
    schema: DMMF.Schema,
  ): MGModelOperation[] {
    if (!mappings) {
      throw new Error(`No operation mapping found for model: ${model.name}`)
    }

    const modelOps = Object.entries(mappings).filter(([map]) => map !== 'model')
    const ops: MGModelOperation[] = []

    const mapArgs = (
      args: readonly DMMF.SchemaArg[] | undefined,
    ): MGModelOperationKeys[] | undefined => {
      return args?.map((a) => ({
        name: a.name,
        types: a.inputTypes as readonly DMMF.InputTypeRef[],
        required: a.isRequired as boolean,
      }))
    }

    modelOps.forEach(([op, val]) => {
      const singular = capitalize(model.name)
      const plural = capitalize(singular)
      const method = `prisma.${lowerCase(model.name)}.${op}`

      const generateUsage = (code: string): string => escapeHtml(code)

      switch (op) {
        case ModelAction.create: {
          const field = schema.outputObjectTypes.prisma
            .find((t) => t.name === 'Mutation')
            ?.fields.find((f) => f.name === val)
          ops.push({
            name: op,
            description: `Create one ${singular}`,
            usage: generateUsage(`// Create one ${singular}
const ${singular} = await ${method}({
  data: {
    // ... data to create a ${singular}
  }
})`),
            opKeys: mapArgs(field?.args),
            output: {
              type: field?.outputType.type as string,
              required: !field?.isNullable,
              list: field?.outputType.isList,
            },
          })
          break
        }
        case ModelAction.deleteMany: {
          const field = schema.outputObjectTypes.prisma
            .find((t) => t.name === 'Mutation')
            ?.fields.find((f) => f.name === val)
          ops.push({
            name: op,
            description: `Delete zero or more ${singular}`,
            usage: generateUsage(`// Delete a few ${plural}
const { count } = await ${method}({
  where: {
    // ... provide filter here
  }
})`),
            opKeys: mapArgs(field?.args),
            output: {
              type: field?.outputType.type as string,
              required: !field?.isNullable,
              list: field?.outputType.isList,
            },
          })
          break
        }
        case ModelAction.delete: {
          const field = schema.outputObjectTypes.prisma
            .find((t) => t.name === 'Mutation')
            ?.fields.find((f) => f.name === val)
          ops.push({
            name: op,
            description: `Delete one ${singular}`,
            usage: generateUsage(`// Delete one ${singular}
const ${singular} = await ${method}({
  where: {
    // ... filter to delete one ${singular}
  }
})`),
            opKeys: mapArgs(field?.args),
            output: {
              type: field?.outputType.type as string,
              required: !field?.isNullable,
              list: field?.outputType.isList,
            },
          })
          break
        }
        case ModelAction.findMany: {
          const field = schema.outputObjectTypes.prisma
            .find((t) => t.name === 'Query')
            ?.fields.find((f) => f.name === val)
          ops.push({
            name: op,
            description: `Find zero or more ${plural}`,
            usage: generateUsage(`// Get all ${plural}
const ${plural} = await ${method}()
// Get first 10 ${plural}
const ${plural} = await ${method}({ take: 10 })`),
            opKeys: mapArgs(field?.args),
            output: {
              type: field?.outputType.type as string,
              required: !field?.isNullable,
              list: field?.outputType.isList,
            },
          })
          break
        }
        case ModelAction.findUnique: {
          const field = schema.outputObjectTypes.prisma
            .find((t) => t.name === 'Query')
            ?.fields.find((f) => f.name === val)
          ops.push({
            name: op,
            description: `Find zero or one ${plural}`,
            usage: generateUsage(`// Get one ${singular}
const ${lowerCase(singular)} = await ${method}({
  where: {
    // ... provide filter here
  }
})`),
            opKeys: mapArgs(field?.args),
            output: {
              type: field?.outputType.type as string,
              required: !field?.isNullable,
              list: field?.outputType.isList,
            },
          })
          break
        }
        case ModelAction.findFirst: {
          const field = schema.outputObjectTypes.prisma
            .find((t) => t.name === 'Query')
            ?.fields.find((f) => f.name === val)
          ops.push({
            name: op,
            description: `Find first ${plural}`,
            usage: generateUsage(`// Get one ${singular}
const ${lowerCase(singular)} = await ${method}({
  where: {
    // ... provide filter here
  }
})`),
            opKeys: mapArgs(field?.args),
            output: {
              type: field?.outputType.type as string,
              required: !field?.isNullable,
              list: field?.outputType.isList,
            },
          })
          break
        }
        case ModelAction.update: {
          const field = schema.outputObjectTypes.prisma
            .find((t) => t.name === 'Mutation')
            ?.fields.find((f) => f.name === val)
          ops.push({
            name: op,
            description: `Update one ${singular}`,
            usage: generateUsage(`// Update one ${singular}
const ${lowerCase(singular)} = await ${method}({
  where: {
    // ... provide filter here
  },
  data: {
    // ... provide data here
  }
})`),
            opKeys: mapArgs(field?.args),
            output: {
              type: field?.outputType.type as string,
              required: !field?.isNullable,
              list: field?.outputType.isList,
            },
          })
          break
        }
        case ModelAction.updateMany: {
          const field = schema.outputObjectTypes.prisma
            .find((t) => t.name === 'Mutation')
            ?.fields.find((f) => f.name === val)
          ops.push({
            name: op,
            description: `Update zero or one ${plural}`,
            usage: generateUsage(`const { count } = await ${method}({
  where: {
    // ... provide filter here
  },
  data: {
    // ... provide data here
  }
})`),
            opKeys: mapArgs(field?.args),
            output: {
              type: field?.outputType.type as string,
              required: !field?.isNullable,
              list: field?.outputType.isList,
            },
          })
          break
        }
        case ModelAction.upsert: {
          const field = schema.outputObjectTypes.prisma
            .find((t) => t.name === 'Mutation')
            ?.fields.find((f) => f.name === val)
          ops.push({
            name: op,
            description: `Create or update one ${plural}`,
            usage: generateUsage(`// Update or create a ${singular}
const ${lowerCase(singular)} = await ${method}({
  create: {
    // ... data to create a ${singular}
  },
  update: {
    // ... in case it already exists, update
  },
  where: {
    // ... the filter for the ${singular} we want to update
  }
})`),
            opKeys: mapArgs(field?.args),
            output: {
              type: field?.outputType.type as string,
              required: !field?.isNullable,
              list: field?.outputType.isList,
            },
          })
          break
        }
      }
    })

    return ops
  }

  private getModels(dmmf: DMMFDocument): MGModel[] {
    return dmmf.datamodel.models.map((model) => ({
      name: model.name,
      documentation: (model as any).documentation as string,
      directives: this.getModelDirective(model),
      fields: this.getModelFields(model),
      operations: this.getModelOperations(
        model,
        dmmf.mappings.find((map) => map.model === model.name),
        dmmf.schema,
      ),
    }))
  }

  getData(d: DMMFDocument): ModelGeneratorStructure {
    return {
      models: this.getModels(d),
    }
  }
}
