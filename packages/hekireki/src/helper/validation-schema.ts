import { docBlockLines, extractObjectType, stripAnnotations } from '../annotation/index.js'

export function makePropertiesGenerator(
  libraryPrefix: string,
  wrapCardinality?: (expr: string, isRequired: boolean) => string,
) {
  return function makeProperties(
    modelFields: readonly {
      readonly documentation: string
      readonly modelName: string
      readonly fieldName: string
      readonly validation: string | null
      readonly isRequired: boolean
      readonly comment?: string
    }[],
  ) {
    return modelFields
      .filter((field) => field.validation !== null && field.validation !== '')
      .map((field) => {
        const base = `${libraryPrefix}.${field.validation}`
        const wrapped = wrapCardinality ? wrapCardinality(base, field.isRequired) : base
        return [...docBlockLines(field.comment, '  '), `  ${field.fieldName}: ${wrapped}`].join(
          '\n',
        )
      })
      .join(',\n')
  }
}

export function validationSchemas(
  models: readonly {
    readonly name: string
    readonly documentation?: string
    readonly fields: readonly {
      readonly name: string
      readonly type: string
      readonly kind: string
      readonly documentation?: string
      readonly isRequired: boolean
      readonly isList: boolean
    }[]
  }[],
  type: boolean,
  config: {
    readonly importStatement: string
    readonly annotationPrefix: `@${string}.`
    readonly extractValidation: (documentation: string | undefined) => string | null
    readonly inferType: (modelName: string) => string
    readonly schemas: (
      fields: readonly {
        readonly documentation: string
        readonly modelName: string
        readonly fieldName: string
        readonly validation: string | null
        readonly isRequired: boolean
        readonly comment?: string
      }[],
      objectType?: 'strict' | 'loose',
    ) => string
    readonly typeMapping?: { [k: string]: string }
    readonly enums?: readonly {
      readonly name: string
      readonly values: readonly { readonly name: string }[]
    }[]
    readonly formatEnum?: (values: readonly string[]) => string
    /** Wraps the schema of one element in the schema of a list (`String[]`, `Role[]`). */
    readonly wrapList: (expression: string) => string
    readonly onWarning?: (message: string) => void
  },
) {
  const modelInfos = models.map((model) => ({
    documentation: model.documentation ?? '',
    name: model.name,
    fields: model.fields,
  }))

  const resolveElement = (field: { readonly type: string; readonly kind: string }) => {
    if (config.typeMapping) {
      const mapped = config.typeMapping[field.type]
      if (mapped !== undefined && mapped !== '') return mapped
    }
    if (config.enums && config.formatEnum && field.kind === 'enum') {
      const enumDef = config.enums.find((e) => e.name === field.type)
      if (enumDef) return config.formatEnum(enumDef.values.map((v) => v.name))
    }
    return null
  }

  // An annotation is the schema of the field as written, a list included: it is never wrapped.
  const resolveValidation = (field: {
    readonly type: string
    readonly kind: string
    readonly documentation?: string
    readonly isList: boolean
  }) => {
    const annotation = config.extractValidation(field.documentation)
    if (annotation !== null) return annotation
    const element = resolveElement(field)
    if (element === null) return null
    return field.isList ? config.wrapList(element) : element
  }

  const modelFields = modelInfos.map((model) =>
    model.fields.map((field) => ({
      documentation: model.documentation,
      modelName: model.name,
      fieldName: field.name,
      validation: resolveValidation(field),
      isRequired: field.isRequired,
      comment: stripAnnotations(field.documentation),
    })),
  )

  if (config.onWarning) {
    const enumNames = new Set((config.enums ?? []).map((e) => e.name))
    const missing = models.flatMap((model) =>
      model.fields
        .filter((f) => f.kind !== 'object')
        .filter((f) => {
          if (config.extractValidation(f.documentation) !== null) return false
          if ((config.typeMapping?.[f.type] ?? '') !== '') return false
          return !(f.kind === 'enum' && enumNames.has(f.type))
        })
        .map((f) => ({ modelName: model.name, fieldName: f.name })),
    )
    for (const { modelName, fieldName } of missing) {
      config.onWarning(
        `Warning: Field "${modelName}.${fieldName}" has no ${config.annotationPrefix} annotation and will be omitted from the schema`,
      )
    }
  }

  const schemaResults = Object.values(groupByModel(isFields(modelFields))).map((fields) => {
    const objectType = extractObjectType(fields[0]?.documentation, config.annotationPrefix)
    const modelComment = stripAnnotations(fields[0]?.documentation)
    return {
      schema: [...docBlockLines(modelComment, ''), config.schemas(fields, objectType)].join('\n'),
      inferType: type ? config.inferType(fields[0]?.modelName ?? '') : '',
    }
  })

  const schemas = schemaResults
    .flatMap(({ schema, inferType }) => [schema, inferType].filter(Boolean))
    .join('\n\n')

  return config.importStatement ? [config.importStatement, '', schemas].join('\n') : schemas
}

export function groupByModel(
  validFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly isRequired: boolean
  }[],
) {
  const raw = Object.groupBy(validFields, (f) => f.modelName)
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, (typeof validFields)[number][]] => entry[1] !== undefined,
    ),
  )
}

export function isFields(
  modelFields: {
    readonly documentation: string | undefined
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly isRequired: boolean
  }[][],
) {
  return modelFields.flat().filter(
    (
      field,
    ): field is Required<{
      documentation: string
      modelName: string
      fieldName: string
      validation: string | null
      isRequired: boolean
    }> => field.validation !== null,
  )
}

export function schemaFromFields(
  modelFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly isRequired: boolean
    readonly comment?: string
  }[],
  schemaBuilder: (modelName: string, fields: string, objectType?: 'strict' | 'loose') => string,
  propertiesGenerator: (
    fields: readonly {
      readonly documentation: string
      readonly modelName: string
      readonly fieldName: string
      readonly validation: string | null
      readonly isRequired: boolean
      readonly comment?: string
    }[],
  ) => string,
  objectType?: 'strict' | 'loose',
) {
  const modelName = modelFields[0]?.modelName ?? ''
  const fields = propertiesGenerator(modelFields)
  return schemaBuilder(modelName, fields, objectType)
}
