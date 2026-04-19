export function getString(v: string | string[] | undefined, fallback?: string) {
  return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback
}

export function getBool(v: unknown, fallback = false) {
  return v === true || v === 'true' || (Array.isArray(v) && v[0] === 'true') ? true : fallback
}

export function makeSnakeCase(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

export function makeValidationExtractor(annotationPrefix: `@${string}.`) {
  const escaped = annotationPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`${escaped}(.+?)(?:\\n|$)`)
  return function extractValidation(documentation: string | undefined) {
    if (!documentation) return null
    const match = documentation.match(regex)
    return match?.[1]?.trim() ?? null
  }
}

const ANNOTATION_PREFIXES = ['@z.', '@v.', '@a.', '@e.', '@t.', '@j.'] as const
const ANNOTATION_EXACT = new Set(['@z', '@v', '@a', '@e', '@t', '@j'])

export function parseDocumentWithoutAnnotations(documentation: string | undefined) {
  if (!documentation) return []
  return documentation
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !ANNOTATION_PREFIXES.some((p) => line.startsWith(p)) &&
        !ANNOTATION_EXACT.has(line),
    )
}

export function stripAnnotations(doc: string | undefined) {
  if (!doc) return undefined
  const result = doc
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return (
        !ANNOTATION_PREFIXES.some((p) => t.startsWith(p)) &&
        !t.startsWith('@relation') &&
        !ANNOTATION_EXACT.has(t)
      )
    })
    .join('\n')
    .trim()
  return result.length > 0 ? result : undefined
}

export function makeCommentBlock(lines: readonly string[], indent: number) {
  if (lines.length === 0) return ''
  const prefix = ' '.repeat(indent)
  return `${prefix}/**\n${lines.map((c) => `${prefix} * ${c}`).join('\n')}\n${prefix} */\n`
}

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
  ) {
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

export function groupByModel(
  validFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly comment: readonly string[]
    readonly validation: string | null
    readonly isRequired: boolean
  }[],
) {
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

export function extractObjectType(
  documentation: string | undefined,
  prefix: `@${string}.`,
): 'strict' | 'loose' | undefined {
  if (!documentation) return undefined
  const prefixWithoutAt = prefix.slice(1)
  const match = documentation
    .split('\n')
    .map((l) => l.trim())
    .find(
      (line) =>
        line.includes(`${prefixWithoutAt}strictObject`) ||
        line.includes(`${prefixWithoutAt}looseObject`),
    )
  if (!match) return undefined
  return match.includes('strictObject') ? 'strict' : 'loose'
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
) {
  const modelName = modelFields[0].modelName
  const fields = propertiesGenerator(modelFields, comment)
  return schemaBuilder(modelName, fields, objectType)
}
