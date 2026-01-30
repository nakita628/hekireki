import type { DMMF } from '@prisma/generator-helper'
import type { ValidationLibraryConfig } from '../types/index.js'

/**
 * Group valid fields by their model name.
 *
 * @param validFields - An array of field objects with validation metadata.
 * @returns An object mapping each model name to its corresponding array of fields.
 */
export function groupByModel(
  validFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly comment: readonly string[]
    readonly validation: string | null
  }[],
): Record<
  string,
  readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly comment: readonly string[]
    readonly validation: string | null
  }[]
> {
  const grouped: Record<
    string,
    {
      readonly documentation: string
      readonly modelName: string
      readonly fieldName: string
      readonly comment: readonly string[]
      readonly validation: string | null
    }[]
  > = {}

  for (const field of validFields) {
    if (!grouped[field.modelName]) {
      grouped[field.modelName] = []
    }
    grouped[field.modelName] = [...grouped[field.modelName], field]
  }

  return grouped
}

/**
 * Extract fields with validation from a nested array of model fields.
 *
 * @param modelFields - A nested array of model field definitions.
 * @returns A flat array of fields that include a non-null `validation` property.
 */
export function isFields(
  modelFields: {
    readonly documentation: string | undefined
    readonly modelName: string
    readonly fieldName: string
    readonly comment: readonly string[]
    readonly validation: string | null
  }[][],
) {
  return modelFields.flat().filter(
    (
      field,
    ): field is Required<{
      documentation: string
      modelName: string
      fieldName: string
      comment: string[]
      validation: string | null
    }> => field.validation !== null,
  )
}

/**
 * Creates schema from model fields.
 *
 * @param modelFields - The list of model fields with metadata.
 * @param comment - Whether to include documentation comments.
 * @param schemaBuilder - Function to build the schema from modelName and fields.
 * @returns The generated schema string.
 */
export function schemaFromFields(
  modelFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly comment: readonly string[]
  }[],
  comment: boolean,
  schemaBuilder: (modelName: string, fields: string) => string,
  propertiesGenerator: (
    fields: readonly {
      readonly documentation: string
      readonly modelName: string
      readonly fieldName: string
      readonly validation: string | null
      readonly comment: readonly string[]
    }[],
    comment: boolean,
  ) => string,
): string {
  const modelName = modelFields[0].modelName
  const modelDoc = modelFields[0].documentation || ''
  const fields = propertiesGenerator(modelFields, comment)
  if (!(modelDoc || !comment)) {
    return schemaBuilder(modelName, fields)
  }
  return schemaBuilder(modelName, fields)
}

/**
 * Creates validation schemas for models.
 *
 * @param models - The models to generate schemas for
 * @param type - Whether to generate types
 * @param comment - Whether to include comments
 * @param config - Configuration for the specific library
 * @returns The generated schemas and types
 */
export function validationSchemas<T extends DMMF.Model>(
  models: readonly T[],
  type: boolean,
  comment: boolean,
  config: ValidationLibraryConfig,
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
