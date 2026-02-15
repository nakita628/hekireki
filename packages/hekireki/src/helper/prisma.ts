import type { DMMF, GeneratorOptions } from '@prisma/generator-helper'
import { findMissingAnnotations, groupByModel, isFields } from '../utils/index.js'

export function collectRelationProps(
  models: readonly DMMF.Model[],
): readonly { model: string; key: string; targetModel: string; isMany: boolean }[] {
  return models.flatMap((m) =>
    m.fields
      .filter((f) => f.kind === 'object')
      .map((f) => ({ model: m.name, key: f.name, targetModel: f.type, isMany: f.isList }) as const),
  )
}

export function makeRelationsOnly(
  dmmf: GeneratorOptions['dmmf'],
  includeType: boolean,
  makeRelations: (
    model: DMMF.Model,
    relProps: readonly {
      readonly key: string
      readonly targetModel: string
      readonly isMany: boolean
    }[],
    options: { readonly includeType: boolean },
  ) => string | null,
): string {
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

/**
 * Creates validation schemas for models.
 */
export function validationSchemas<T extends DMMF.Model>(
  models: readonly T[],
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
        readonly comment: readonly string[]
      }[],
      comment: boolean,
    ) => string
  },
): string {
  const modelInfos = models.map((model) => ({
    documentation: model.documentation ?? '',
    name: model.name,
    fields: model.fields,
  }))

  const modelFields = modelInfos.map((model) => {
    const fields = model.fields.map((field) => ({
      documentation: model.documentation,
      modelName: model.name,
      fieldName: field.name,
      comment: config.parseDocument(field.documentation),
      validation: config.extractValidation(field.documentation),
    }))
    return fields
  })

  const missing = findMissingAnnotations(models, config.extractValidation)
  for (const { modelName, fieldName } of missing) {
    console.warn(
      `Warning: Field "${modelName}.${fieldName}" has no ${config.annotationPrefix} annotation and will be omitted from the schema`,
    )
  }

  const schemaResults = Object.values(groupByModel(isFields(modelFields))).map((fields) => ({
    schema: config.schemas(fields, comment),
    inferType: type ? config.inferType(fields[0].modelName) : '',
  }))

  return [
    config.importStatement,
    '',
    schemaResults
      .flatMap(({ schema, inferType }) => [schema, inferType].filter(Boolean))
      .join('\n\n'),
  ].join('\n')
}
