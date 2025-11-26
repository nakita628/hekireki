import type { DMMF } from '@prisma/generator-helper'

/**
 * Capitalize the first letter of a string.
 *
 * @param str - The input string.
 * @returns A new string with the first letter capitalized.
 */
export function capitalize(str: string): string {
  return `${str.charAt(0).toUpperCase()}${str.slice(1)}`
}

/**
 * Convert a camelCase or PascalCase string to snake_case.
 *
 * @param name - The input string in camelCase or PascalCase.
 * @returns The converted string in snake_case.
 */
export function snakeCase(name: string): string {
  return `${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`
}

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
 * Extracts annotation content from documentation lines.
 * Returns the substring after the tag (e.g. '@z.' or '@v.').
 */
export function extractAnno(doc: string, tag: '@z.' | '@v.'): string | null {
  const line = doc
    .split('\n')
    .map((s) => s.trim())
    .find((l) => l.startsWith(tag))
  return line ? line.slice(tag.length) : null
}

/**
 * Builds JSDoc from documentation, excluding annotation lines like '@z.' and '@v.'.
 */
export function jsdoc(doc?: string): string {
  const lines = (doc ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter((l) => l && !l.startsWith('@z.') && !l.startsWith('@v.'))
  return lines.length ? `/**\n * ${lines.join('\n * ')}\n */\n` : ''
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
  config: {
    readonly importStatement: string
    readonly parseDocument: (doc: string | undefined) => readonly string[]
    readonly extractValidation: (doc: string | undefined) => string | null
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
