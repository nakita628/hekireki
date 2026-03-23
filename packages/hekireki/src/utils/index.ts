// ============================================================================
// Config Utilities
// ============================================================================

export function getString(v: string | string[] | undefined, fallback?: string): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback
}

export function getBool(v: unknown, fallback = false): boolean {
  return v === true || v === 'true' || (Array.isArray(v) && v[0] === 'true') ? true : fallback
}

// ============================================================================
// String Utilities
// ============================================================================

export function makeSnakeCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

// ============================================================================
// Annotation Utilities
// ============================================================================

export function makeValidationExtractor(annotationPrefix: `@${string}.`) {
  const escaped = annotationPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`${escaped}(.+?)(?:\\n|$)`)

  return function extractValidation(documentation: string | undefined): string | null {
    if (!documentation) return null
    const match = documentation.match(regex)
    return match?.[1]?.trim() ?? null
  }
}

export function parseDocumentWithoutAnnotations(
  documentation: string | undefined,
): readonly string[] {
  if (!documentation) return []

  return documentation
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        !['@z.', '@v.', '@a.', '@e.', '@t.', '@j.'].some((prefix) => line.startsWith(prefix)),
    )
    .filter((line) => !['@z', '@v', '@a', '@e', '@t', '@j'].includes(line))
    .filter((line) => line.length > 0)
}

export function stripAnnotations(doc: string | undefined): string | undefined {
  if (!doc) return undefined
  const lines = doc.split('\n').filter((line) => {
    const trimmed = line.trim()
    return !(
      trimmed.startsWith('@z.') ||
      trimmed.startsWith('@v.') ||
      trimmed.startsWith('@a.') ||
      trimmed.startsWith('@e.') ||
      trimmed.startsWith('@t.') ||
      trimmed.startsWith('@j.') ||
      trimmed.startsWith('@relation') ||
      trimmed === '@z' ||
      trimmed === '@v' ||
      trimmed === '@a' ||
      trimmed === '@e' ||
      trimmed === '@t' ||
      trimmed === '@j'
    )
  })
  const result = lines.join('\n').trim()
  return result.length > 0 ? result : undefined
}

// ============================================================================
// JSDoc Comment Block
// ============================================================================

/**
 * Generate a JSDoc comment block from comment lines
 * @param lines - The comment lines to include
 * @param indent - The indentation level in spaces
 */
export function makeCommentBlock(lines: readonly string[], indent: number): string {
  if (lines.length === 0) return ''
  const prefix = ' '.repeat(indent)
  return `${prefix}/**\n${lines.map((c) => `${prefix} * ${c}`).join('\n')}\n${prefix} */\n`
}

// ============================================================================
// Properties Generator
// ============================================================================

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
          (line) =>
            !(
              line.includes('@relation') ||
              line.includes('@z') ||
              line.includes('@v') ||
              line.includes('@a') ||
              line.includes('@e') ||
              line.includes('@t') ||
              line.includes('@j')
            ),
        )

        const docComment = includeComments ? makeCommentBlock(cleanLines, 2) : ''

        const base = `${libraryPrefix}.${field.validation}`
        const wrapped = wrapCardinality ? wrapCardinality(base, field.isRequired) : base

        return `${docComment}  ${field.fieldName}: ${wrapped}`
      })
      .join(',\n')
  }
}

// ============================================================================
// Schema Utilities
// ============================================================================

export function groupByModel(
  validFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly comment: readonly string[]
    readonly validation: string | null
    readonly isRequired: boolean
  }[],
): {
  [k: string]: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly comment: readonly string[]
    readonly validation: string | null
    readonly isRequired: boolean
  }[]
} {
  const raw = Object.groupBy(validFields, (f) => f.modelName)
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, (typeof validFields)[number][]] => entry[1] != null,
    ),
  )
}

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
 * Extract object type (strict/loose) from model documentation.
 */
export function extractObjectType(
  documentation: string | undefined,
  prefix: `@${string}.`,
): 'strict' | 'loose' | undefined {
  if (!documentation) return undefined
  const lines = documentation.split('\n').map((l) => l.trim())
  const prefixWithoutAt = prefix.slice(1)
  const match = lines.find(
    (line) =>
      line.includes(`${prefixWithoutAt}strictObject`) ||
      line.includes(`${prefixWithoutAt}looseObject`),
  )
  if (!match) return undefined
  if (match.includes('strictObject')) return 'strict'
  if (match.includes('looseObject')) return 'loose'
  return undefined
}

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
  schemaBuilder: (modelName: string, fields: string, objectType?: 'strict' | 'loose') => string,
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
  objectType?: 'strict' | 'loose',
): string {
  const modelName = modelFields[0].modelName
  const fields = propertiesGenerator(modelFields, comment)
  return schemaBuilder(modelName, fields, objectType)
}
