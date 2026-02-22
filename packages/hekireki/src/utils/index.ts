// ============================================================================
// Config Utilities
// ============================================================================

/**
 * Extract a string value from generator config.
 */
export const getString = (
  v: string | string[] | undefined,
  fallback?: string,
): string | undefined =>
  typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback

/**
 * Extract a boolean value from generator config.
 */
export const getBool = (v: unknown, fallback = false): boolean =>
  v === true || v === 'true' || (Array.isArray(v) && v[0] === 'true') ? true : fallback

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Capitalize the first character
 */
export function makeCapitalized(str: string): string {
  return `${str.charAt(0).toUpperCase()}${str.slice(1)}`
}

/**
 * Convert camelCase/PascalCase to snake_case
 */
export function makeSnakeCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

// ============================================================================
// Annotation Utilities
// ============================================================================

/**
 * Check if documentation contains a bare annotation (e.g. "@z" without ".something")
 */
export function hasBareAnnotation(documentation: string | undefined, barePrefix: string): boolean {
  if (!documentation) return false
  return documentation.split('\n').some((line) => line.trim() === barePrefix)
}

/**
 * Create a document parser that filters out annotation lines
 */
export function makeDocumentParser(annotationPrefix: `@${string}.`) {
  const barePrefix = annotationPrefix.slice(0, -1) // '@z.' → '@z'
  return function parseDocument(documentation: string | undefined): readonly string[] {
    return (
      documentation
        ?.split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.includes(annotationPrefix) && line !== barePrefix) ?? []
    )
  }
}

/**
 * Create a validation extractor for a specific annotation prefix
 */
export function makeValidationExtractor(annotationPrefix: `@${string}.`) {
  const escaped = annotationPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`${escaped}(.+?)(?:\\n|$)`)

  return function extractValidation(documentation: string | undefined): string | null {
    if (!documentation) return null
    const match = documentation.match(regex)
    return match?.[1]?.trim() ?? null
  }
}

/**
 * Create an annotation extractor for a specific prefix
 */
export function makeAnnotationExtractor(annotationPrefix: `@${string}.`) {
  return function extractAnnotation(documentation: string): string | null {
    const line = documentation
      .split('\n')
      .map((s) => s.trim())
      .find((l) => l.startsWith(annotationPrefix))
    return line ? line.slice(annotationPrefix.length) : null
  }
}

/**
 * Create a JSDoc string from documentation lines
 */
export function makeJsDoc(
  documentation: string | undefined,
  excludePrefixes: readonly `@${string}.`[] = ['@z.', '@v.'],
): string {
  const barePrefixes = excludePrefixes.map((p) => p.slice(0, -1))
  const lines = (documentation ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(
      (l) =>
        l && !excludePrefixes.some((prefix) => l.startsWith(prefix)) && !barePrefixes.includes(l),
    )
  return lines.length ? `/**\n * ${lines.join('\n * ')}\n */\n` : ''
}

/**
 * Parse documentation and filter out all annotation lines.
 */
export function parseDocumentWithoutAnnotations(
  documentation: string | undefined,
): readonly string[] {
  if (!documentation) return []

  return documentation
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !['@z.', '@v.', '@a.', '@e.'].some((prefix) => line.startsWith(prefix)))
    .filter((line) => !['@z', '@v', '@a', '@e'].includes(line))
    .filter((line) => line.length > 0)
}

// ============================================================================
// Enum Formatters
// ============================================================================

/**
 * Format enum values as Zod enum expression
 */
export function makeZodEnumExpression(values: readonly string[]): string {
  return `enum([${values.map((v) => `'${v}'`).join(', ')}])`
}

/**
 * Format enum values as Valibot picklist expression
 */
export function makeValibotEnumExpression(values: readonly string[]): string {
  return `picklist([${values.map((v) => `'${v}'`).join(', ')}])`
}

/**
 * Format enum values as ArkType union expression
 */
export function makeArktypeEnumExpression(values: readonly string[]): string {
  return `"${values.map((v) => `'${v}'`).join(' | ')}"`
}

/**
 * Format enum values as Effect Schema.Literal expression
 */
export function makeEffectEnumExpression(values: readonly string[]): string {
  return `Schema.Literal(${values.map((v) => `'${v}'`).join(', ')})`
}

// ============================================================================
// Properties Generator
// ============================================================================

/**
 * Create a properties generator for a specific validation library
 */
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
      readonly comment: readonly string[]
    }[],
    includeComments: boolean,
  ): string {
    return modelFields
      .filter((field) => field.validation)
      .map((field) => {
        const cleanLines = field.comment.filter(
          (line) => !(line.includes('@relation') || line.includes('@v') || line.includes('@z')),
        )

        const docComment =
          includeComments && cleanLines.length > 0
            ? `  /**\n${cleanLines.map((line) => `   * ${line}`).join('\n')}\n   */\n`
            : ''

        const base = `${libraryPrefix}.${field.validation}`
        const wrapped = wrapCardinality ? wrapCardinality(base, field.isRequired) : base

        return `${docComment}  ${field.fieldName}: ${wrapped}`
      })
      .join(',\n')
  }
}

// ============================================================================
// Zod Helpers
// ============================================================================

/**
 * Create Zod type inference line
 */
export function makeZodInfer(
  modelName: string,
): `export type ${string} = z.infer<typeof ${string}Schema>` {
  return `export type ${modelName} = z.infer<typeof ${modelName}Schema>`
}

/**
 * Create Zod object wrapper
 */
export function makeZodObject(
  inner: string,
  wrapperType: 'object' | 'strictObject' | 'looseObject' = 'object',
): string {
  switch (wrapperType) {
    case 'strictObject':
      return `z.strictObject({${inner}})`
    case 'looseObject':
      return `z.looseObject({${inner}})`
    default:
      return `z.object({${inner}})`
  }
}

/**
 * Create Zod cardinality wrapper (array + optional)
 */
export function makeZodCardinality(expr: string, isList: boolean, isRequired: boolean): string {
  const withList = isList ? `z.array(${expr})` : expr
  return isRequired ? withList : `${withList}.exactOptional()`
}

/**
 * Generate Zod schema
 */
export function makeZodSchema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = z.object({\n${string}\n})` {
  return `export const ${modelName}Schema = z.object({\n${fields}\n})`
}

// ============================================================================
// Valibot Helpers
// ============================================================================

/**
 * Create Valibot type inference line
 */
export function makeValibotInfer(
  modelName: string,
): `export type ${string} = v.InferInput<typeof ${string}Schema>` {
  return `export type ${modelName} = v.InferInput<typeof ${modelName}Schema>`
}

/**
 * Create Valibot object wrapper
 */
export function makeValibotObject(
  inner: string,
  wrapperType: 'object' | 'strictObject' | 'looseObject' = 'object',
): string {
  switch (wrapperType) {
    case 'strictObject':
      return `v.strictObject({${inner}})`
    case 'looseObject':
      return `v.looseObject({${inner}})`
    default:
      return `v.object({${inner}})`
  }
}

/**
 * Create Valibot cardinality wrapper (array + optional)
 */
export function makeValibotCardinality(expr: string, isList: boolean, isRequired: boolean): string {
  const withList = isList ? `v.array(${expr})` : expr
  return isRequired ? withList : `v.exactOptional(${withList})`
}

/**
 * Generate Valibot schema
 */
export function makeValibotSchema(modelName: string, fields: string) {
  return `export const ${modelName}Schema = v.object({\n${fields}\n})`
}

// ============================================================================
// ArkType Helpers
// ============================================================================

/**
 * Generate ArkType infer type statement.
 */
export function makeArktypeInfer(modelName: string): string {
  return `export type ${modelName} = typeof ${modelName}Schema.infer`
}

/**
 * Generate ArkType schema
 */
export function makeArktypeSchema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = type({\n${string}\n})` {
  return `export const ${modelName}Schema = type({\n${fields}\n})`
}

/**
 * Generate properties for ArkType schema.
 */
export function makeArktypeProperties(
  fields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly isRequired: boolean
    readonly comment: readonly string[]
  }[],
  comment: boolean,
): string {
  return fields
    .map((field) => {
      const commentLines =
        comment && field.comment.length > 0
          ? `${field.comment.map((c) => `  /** ${c} */`).join('\n')}\n`
          : ''
      return `${commentLines}  ${field.fieldName}: ${field.validation ?? '"unknown"'},`
    })
    .join('\n')
}

// ============================================================================
// Effect Helpers
// ============================================================================

/**
 * Generate Effect Schema infer type statement.
 */
export function makeEffectInfer(modelName: string): string {
  return `export type ${modelName} = Schema.Schema.Type<typeof ${modelName}Schema>`
}

/**
 * Generate Effect Schema
 */
export function makeEffectSchema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = Schema.Struct({\n${string}\n})` {
  return `export const ${modelName}Schema = Schema.Struct({\n${fields}\n})`
}

/**
 * Generate properties for Effect Schema.
 */
export function makeEffectProperties(
  fields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly isRequired: boolean
    readonly comment: readonly string[]
  }[],
  comment: boolean,
): string {
  return fields
    .map((field) => {
      const commentLines =
        comment && field.comment.length > 0
          ? `${field.comment.map((c) => `  /** ${c} */`).join('\n')}\n`
          : ''
      return `${commentLines}  ${field.fieldName}: ${field.validation ?? 'Schema.Unknown'},`
    })
    .join('\n')
}

// ============================================================================
// Relation Utilities
// ============================================================================

/**
 * Check if string is a valid relationship type
 */
export function isRelationshipType(
  type: string,
): type is 'zero-one' | 'one' | 'zero-many' | 'many' {
  return type === 'zero-one' || type === 'one' || type === 'zero-many' || type === 'many'
}

/**
 * Remove duplicate relations and exclude any that are many-to-one.
 */
export function excludeManyToOneRelations(relations: readonly string[]): readonly string[] {
  return [...new Set(relations)].filter((r) => !r.includes('many-to-one'))
}

/**
 * Parse a `@relation` annotation line into a structured relation object.
 */
export function parseRelation(line: string): {
  readonly fromModel: string
  readonly fromField: string
  readonly toModel: string
  readonly toField: string
  readonly type: string
} | null {
  const relationRegex = /^@relation\s+(\w+)\.(\w+)\s+(\w+)\.(\w+)\s+(\w+-to-\w+)$/
  const match = line.trim().match(relationRegex)

  if (!match) {
    return null
  }

  const [, fromModel, fromField, toModel, toField, relationType] = match

  return {
    fromModel,
    fromField,
    toModel,
    toField,
    type: relationType,
  }
}

/**
 * Remove duplicate relation lines from an array of Mermaid ER diagram relations.
 */
export function removeDuplicateRelations(relations: readonly string[]): readonly string[] {
  return [...new Set(relations)]
}

// ============================================================================
// DBML Utilities
// ============================================================================

export function escapeNote(str: string): string {
  return str.replace(/'/g, "\\'")
}

export function formatConstraints(constraints: readonly string[]): string {
  return constraints.length > 0 ? ` [${constraints.join(', ')}]` : ''
}

export function makeEnum(enumDef: {
  readonly name: string
  readonly values: readonly string[]
}): string {
  return [`Enum ${enumDef.name} {`, ...enumDef.values.map((v) => `  ${v}`), '}'].join('\n')
}

export function makeRefName(ref: {
  readonly name?: string
  readonly fromTable: string
  readonly fromColumn: string
  readonly toTable: string
  readonly toColumn: string
}): string {
  return ref.name ?? `${ref.fromTable}_${ref.fromColumn}_${ref.toTable}_${ref.toColumn}_fk`
}

/**
 * Strip validation annotations (@z.*, @v.*, @a.*, @e.*) and relation annotations (@relation) from documentation
 */
export function stripAnnotations(doc: string | undefined): string | undefined {
  if (!doc) return undefined
  const lines = doc.split('\n').filter((line) => {
    const trimmed = line.trim()
    return !(
      trimmed.startsWith('@z.') ||
      trimmed.startsWith('@v.') ||
      trimmed.startsWith('@a.') ||
      trimmed.startsWith('@e.') ||
      trimmed.startsWith('@relation') ||
      trimmed === '@z' ||
      trimmed === '@v' ||
      trimmed === '@a' ||
      trimmed === '@e'
    )
  })
  const result = lines.join('\n').trim()
  return result.length > 0 ? result : undefined
}

/**
 * Combine keys for composite foreign keys
 */
export function combineKeys(keys: readonly string[]): string {
  return keys.length > 1 ? `(${keys.join(', ')})` : keys[0]
}

// ============================================================================
// Ecto Utilities
// ============================================================================

/**
 * Convert Prisma type to Ecto type
 */
export function prismaTypeToEctoType(
  type: string,
): 'integer' | 'string' | 'boolean' | 'utc_datetime' | 'float' | 'decimal' | 'map' | 'binary' {
  if (type === 'Int') return 'integer'
  if (type === 'BigInt') return 'integer'
  if (type === 'Float') return 'float'
  if (type === 'Decimal') return 'decimal'
  if (type === 'String') return 'string'
  if (type === 'Boolean') return 'boolean'
  if (type === 'DateTime') return 'utc_datetime'
  if (type === 'Json') return 'map'
  if (type === 'Bytes') return 'binary'
  return 'string'
}

/**
 * Convert Ecto type to Elixir typespec
 */
export function ectoTypeToTypespec(type: string): string {
  switch (type) {
    case 'string':
      return 'String.t()'
    case 'integer':
      return 'integer()'
    case 'float':
      return 'float()'
    case 'boolean':
      return 'boolean()'
    case 'binary_id':
      return 'Ecto.UUID.t()'
    case 'naive_datetime':
      return 'NaiveDateTime.t()'
    case 'utc_datetime':
      return 'DateTime.t()'
    case 'decimal':
      return 'Decimal.t()'
    case 'map':
      return 'map()'
    case 'binary':
      return 'binary()'
    default:
      return 'term()'
  }
}

// ============================================================================
// Annotation Detection
// ============================================================================

/**
 * Find fields that are missing validation annotations.
 */
export function findMissingAnnotations(
  models: readonly {
    readonly name: string
    readonly fields: readonly {
      readonly name: string
      readonly kind: string
      readonly documentation?: string | undefined
    }[]
  }[],
  extractValidation: (documentation: string | undefined) => string | null,
): readonly { readonly modelName: string; readonly fieldName: string }[] {
  return models.flatMap((model) =>
    model.fields
      .filter((field) => field.kind !== 'object')
      .filter((field) => extractValidation(field.documentation) === null)
      .map((field) => ({ modelName: model.name, fieldName: field.name })),
  )
}

// ============================================================================
// Schema Utilities
// ============================================================================

/**
 * Group valid fields by their model name.
 */
export function groupByModel(
  validFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly comment: readonly string[]
    readonly validation: string | null
    readonly isRequired: boolean
  }[],
): Record<
  string,
  readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly comment: readonly string[]
    readonly validation: string | null
    readonly isRequired: boolean
  }[]
> {
  const raw = Object.groupBy(validFields, (f) => f.modelName)
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, (typeof validFields)[number][]] => entry[1] != null,
    ),
  )
}

/**
 * Extract fields with validation from a nested array of model fields.
 */
export function isFields(
  modelFields: {
    readonly documentation: string | undefined
    readonly modelName: string
    readonly fieldName: string
    readonly comment: readonly string[]
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
      comment: string[]
      validation: string | null
      isRequired: boolean
    }> => field.validation !== null,
  )
}

/**
 * Creates schema from model fields.
 */
export function schemaFromFields(
  modelFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly isRequired: boolean
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
      readonly isRequired: boolean
      readonly comment: readonly string[]
    }[],
    comment: boolean,
  ) => string,
): string {
  const modelName = modelFields[0].modelName
  const fields = propertiesGenerator(modelFields, comment)
  return schemaBuilder(modelName, fields)
}
