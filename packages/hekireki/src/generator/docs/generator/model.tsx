import type { FC } from 'hono/jsx'
import type { DMMF } from '@prisma/generator-helper'
import { capitalize, isScalarType, lowerCase } from './helpers.js'
import type { DMMFDocument, DMMFMapping } from './transformDMMF.js'
import { styles } from '../styles.js'

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
  readonly models: readonly MGModel[]
}

type MGModel = {
  readonly documentation?: string
  readonly name: string
  readonly directives: readonly MGModelDirective[]
  readonly fields: readonly MGModelField[]
  readonly operations: readonly MGModelOperation[]
}

type MGModelDirective = {
  readonly name: string
  readonly values: readonly string[]
}

type MGModelField = {
  readonly name: string
  readonly type: string
  readonly bareTypeName: string
  readonly directives: readonly string[]
  readonly documentation?: string
  readonly required: boolean
}

type MGModelOperationKeys = {
  readonly name: string
  readonly types: readonly DMMF.InputTypeRef[]
  readonly required: boolean
}

type MGModelOperationOutput = {
  readonly type: string
  readonly required: boolean
  readonly list: boolean
}

type MakeOptionallyUndefined<T> = {
  [k in keyof T]: T[k] | undefined
}

type MGModelOperation = {
  readonly name: string
  readonly description: string
  readonly opKeys: readonly MGModelOperationKeys[] | undefined
  readonly usage: string
  readonly output: MakeOptionallyUndefined<MGModelOperationOutput>
}

type FieldDefault = {
  readonly name: string
  readonly args: readonly unknown[]
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

// Data transformation functions
const getModelDirective = (model: DMMF.Model): readonly MGModelDirective[] => {
  const directiveValue: MGModelDirective[] = []

  if (model.primaryKey) {
    directiveValue.push({ name: '@@id', values: [...model.primaryKey.fields] })
  }

  model.uniqueFields.forEach((uniqueField) => {
    directiveValue.push({ name: '@@unique', values: [...uniqueField] })
  })

  model.uniqueIndexes.forEach((uniqueIndex) => {
    directiveValue.push({ name: '@@index', values: [...uniqueIndex.fields] })
  })

  return directiveValue
}

const getFieldType = (field: DMMF.Field): string => {
  const name =
    field.isRequired || field.isList
      ? field.type
      : `${field.type}?`
  return field.isList ? `${name.replace('?', '')}[]` : name
}

const getFieldDirectives = (field: DMMF.Field): readonly string[] => {
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

const getModelFields = (model: DMMF.Model): readonly MGModelField[] =>
  model.fields.map((field) => ({
    name: field.name,
    type: getFieldType(field),
    bareTypeName: field.type,
    documentation: (field as { documentation?: string }).documentation,
    directives: getFieldDirectives(field),
    required: field.isRequired,
  }))

const mapArgs = (
  args: readonly DMMF.SchemaArg[] | undefined,
): readonly MGModelOperationKeys[] | undefined =>
  args?.map((a) => ({
    name: a.name,
    types: a.inputTypes as readonly DMMF.InputTypeRef[],
    required: a.isRequired as boolean,
  }))

const operationDescriptions: Record<string, (singular: string, plural: string) => { desc: string; queryType: 'Query' | 'Mutation' }> = {
  [ModelAction.create]: (singular) => ({ desc: `Create one ${singular}`, queryType: 'Mutation' }),
  [ModelAction.deleteMany]: (singular) => ({ desc: `Delete zero or more ${singular}`, queryType: 'Mutation' }),
  [ModelAction.delete]: (singular) => ({ desc: `Delete one ${singular}`, queryType: 'Mutation' }),
  [ModelAction.findMany]: (_, plural) => ({ desc: `Find zero or more ${plural}`, queryType: 'Query' }),
  [ModelAction.findUnique]: (_, plural) => ({ desc: `Find zero or one ${plural}`, queryType: 'Query' }),
  [ModelAction.findFirst]: (_, plural) => ({ desc: `Find first ${plural}`, queryType: 'Query' }),
  [ModelAction.update]: (singular) => ({ desc: `Update one ${singular}`, queryType: 'Mutation' }),
  [ModelAction.updateMany]: (_, plural) => ({ desc: `Update zero or one ${plural}`, queryType: 'Mutation' }),
  [ModelAction.upsert]: (_, plural) => ({ desc: `Create or update one ${plural}`, queryType: 'Mutation' }),
}

const operationUsageTemplates: Record<string, (singular: string, plural: string, method: string) => string> = {
  [ModelAction.create]: (singular, _, method) => `// Create one ${singular}
const ${singular} = await ${method}({
  data: {
    // ... data to create a ${singular}
  }
})`,
  [ModelAction.deleteMany]: (singular, plural, method) => `// Delete a few ${plural}
const { count } = await ${method}({
  where: {
    // ... provide filter here
  }
})`,
  [ModelAction.delete]: (singular, _, method) => `// Delete one ${singular}
const ${singular} = await ${method}({
  where: {
    // ... filter to delete one ${singular}
  }
})`,
  [ModelAction.findMany]: (_, plural, method) => `// Get all ${plural}
const ${plural} = await ${method}()
// Get first 10 ${plural}
const ${plural} = await ${method}({ take: 10 })`,
  [ModelAction.findUnique]: (singular, _, method) => `// Get one ${singular}
const ${lowerCase(singular)} = await ${method}({
  where: {
    // ... provide filter here
  }
})`,
  [ModelAction.findFirst]: (singular, _, method) => `// Get one ${singular}
const ${lowerCase(singular)} = await ${method}({
  where: {
    // ... provide filter here
  }
})`,
  [ModelAction.update]: (singular, _, method) => `// Update one ${singular}
const ${lowerCase(singular)} = await ${method}({
  where: {
    // ... provide filter here
  },
  data: {
    // ... provide data here
  }
})`,
  [ModelAction.updateMany]: (_, __, method) => `const { count } = await ${method}({
  where: {
    // ... provide filter here
  },
  data: {
    // ... provide data here
  }
})`,
  [ModelAction.upsert]: (singular, _, method) => `// Update or create a ${singular}
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
})`,
}

const getModelOperations = (
  model: DMMF.Model,
  mappings: DMMFMapping | undefined,
  schema: DMMF.Schema,
): readonly MGModelOperation[] => {
  if (!mappings) {
    throw new Error(`No operation mapping found for model: ${model.name}`)
  }

  const modelOps = Object.entries(mappings).filter(([map]) => map !== 'model')
  const singular = capitalize(model.name)
  const plural = capitalize(singular)

  return modelOps
    .map(([op, val]): MGModelOperation | null => {
      const opInfo = operationDescriptions[op]
      const usageTemplate = operationUsageTemplates[op]
      if (!opInfo || !usageTemplate) return null

      const { desc, queryType } = opInfo(singular, plural)
      const method = `prisma.${lowerCase(model.name)}.${op}`
      const field = schema.outputObjectTypes.prisma
        .find((t) => t.name === queryType)
        ?.fields.find((f) => f.name === val)

      return {
        name: op,
        description: desc,
        usage: escapeHtml(usageTemplate(singular, plural, method)),
        opKeys: mapArgs(field?.args),
        output: {
          type: field?.outputType.type as string,
          required: !field?.isNullable,
          list: field?.outputType.isList,
        },
      }
    })
    .filter((op): op is MGModelOperation => op !== null)
}

const getModels = (dmmf: DMMFDocument): readonly MGModel[] =>
  dmmf.datamodel.models.map((model) => ({
    name: model.name,
    documentation: (model as { documentation?: string }).documentation,
    directives: getModelDirective(model),
    fields: getModelFields(model),
    operations: getModelOperations(
      model,
      dmmf.mappings.find((map) => map.model === model.name),
      dmmf.schema,
    ),
  }))

const getModelData = (d: DMMFDocument): ModelGeneratorStructure => ({
  models: getModels(d),
})

export const createModels = (d: DMMFDocument) => {
  const data = getModelData(d)
  return <ModelsSection data={data} />
}
