import { extractObjectType, groupByModel, isFields } from '../utils/index.js'

export function collectRelationProps(
  models: readonly {
    readonly name: string
    readonly fields: readonly {
      readonly name: string
      readonly type: string
      readonly kind: string
      readonly isList: boolean
    }[]
  }[],
): readonly { model: string; key: string; targetModel: string; isMany: boolean }[] {
  return models.flatMap((m) =>
    m.fields
      .filter((f) => f.kind === 'object')
      .map((f) => ({ model: m.name, key: f.name, targetModel: f.type, isMany: f.isList }) as const),
  )
}

export function makeRelationsOnly(
  dmmf: {
    readonly datamodel: {
      readonly models: readonly {
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
      }[]
    }
  },
  includeType: boolean,
  makeRelations: (
    model: {
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
    },
    relProps: readonly {
      readonly key: string
      readonly targetModel: string
      readonly isMany: boolean
    }[],
    options: { readonly includeType: boolean },
  ) => string | null,
) {
  const models = dmmf.datamodel.models
  const relIndex = collectRelationProps(models)
  const relByModel = Object.groupBy(relIndex, (r) => r.model)
  return models
    .map((model) =>
      makeRelations(
        model,
        (relByModel[model.name] ?? []).map(({ key, targetModel, isMany }) => ({
          key,
          targetModel,
          isMany,
        })),
        { includeType },
      ),
    )
    .filter((code): code is string => Boolean(code))
    .join('\n\n')
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
  comment: boolean,
  config: {
    readonly importStatement: string
    readonly annotationPrefix: `@${string}.`
    readonly parseDocument: (documentation: string | undefined) => readonly string[]
    readonly extractValidation: (documentation: string | undefined) => string | null
    readonly inferType: (modelName: string) => string
    readonly schemas: (
      fields: readonly {
        readonly documentation: string
        readonly modelName: string
        readonly fieldName: string
        readonly validation: string | null
        readonly isRequired: boolean
        readonly comment: readonly string[]
      }[],
      comment: boolean,
      objectType?: 'strict' | 'loose',
    ) => string
    readonly typeMapping?: Record<string, string>
    readonly enums?: readonly {
      readonly name: string
      readonly values: readonly { readonly name: string }[]
    }[]
    readonly formatEnum?: (values: readonly string[]) => string
    readonly onWarning?: (message: string) => void
  },
) {
  const modelInfos = models.map((model) => ({
    documentation: model.documentation ?? '',
    name: model.name,
    fields: model.fields,
  }))

  const resolveValidation = (field: {
    readonly type: string
    readonly kind: string
    readonly documentation?: string
  }): string | null => {
    const annotation = config.extractValidation(field.documentation)
    if (annotation !== null) return annotation
    if (config.typeMapping) {
      const mapped = config.typeMapping[field.type]
      if (mapped) return mapped
    }
    if (config.enums && config.formatEnum && field.kind === 'enum') {
      const enumDef = config.enums.find((e) => e.name === field.type)
      if (enumDef) return config.formatEnum(enumDef.values.map((v) => v.name))
    }
    return null
  }

  const modelFields = modelInfos.map((model) =>
    model.fields.map((field) => ({
      documentation: model.documentation,
      modelName: model.name,
      fieldName: field.name,
      comment: config.parseDocument(field.documentation),
      validation: resolveValidation(field),
      isRequired: field.isRequired,
    })),
  )

  if (config.onWarning) {
    const missing = models.flatMap((model) =>
      model.fields
        .filter((f) => f.kind !== 'object')
        .filter((f) => {
          if (config.extractValidation(f.documentation) !== null) return false
          if (config.typeMapping?.[f.type]) return false
          if (config.enums && f.kind === 'enum' && config.enums.some((e) => e.name === f.type)) {
            return false
          }
          return true
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
    const objectType = extractObjectType(fields[0].documentation, config.annotationPrefix)
    return {
      schema: config.schemas(fields, comment, objectType),
      inferType: type ? config.inferType(fields[0].modelName) : '',
    }
  })

  const schemas = schemaResults
    .flatMap(({ schema, inferType }) => [schema, inferType].filter(Boolean))
    .join('\n\n')

  return config.importStatement ? [config.importStatement, '', schemas].join('\n') : schemas
}
