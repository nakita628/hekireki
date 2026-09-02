export function parseRelation(line: string) {
  const match = line.trim().match(/^@relation\s+(\w+)\.(\w+)\s+(\w+)\.(\w+)\s+(\w+-to-\w+)$/u)
  if (!match) return null
  const [, fromModel, fromField, toModel, toField, type] = match
  return { fromModel, fromField, toModel, toField, type }
}

export function getString(v: string | string[] | undefined) {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

export function getBool(v: unknown, fallback = false) {
  return v === true || v === 'true' || (Array.isArray(v) && v[0] === 'true') ? true : fallback
}

export function makeSnakeCase(name: string) {
  return name.replaceAll(/([a-z0-9])([A-Z])/gu, '$1_$2').toLowerCase()
}

export function makePascalCase(name: string) {
  return name
    .split('_')
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export function makeValidationExtractor(annotationPrefix: `@${string}.`) {
  const escaped = annotationPrefix.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const regex = new RegExp(`${escaped}(.+?)(?:\\n|$)`, 'u')
  return function extractValidation(documentation: string | undefined) {
    if (!documentation) return null
    const match = documentation.match(regex)
    return match?.[1]?.trim() ?? null
  }
}

export function parseDocumentWithoutAnnotations(documentation: string | undefined) {
  if (!documentation) return []
  const annotationPrefixes = ['@z.', '@v.', '@a.', '@e.', '@t.', '@j.', '@p.']
  const annotationExact = new Set(['@z', '@v', '@a', '@e', '@t', '@j', '@p'])
  return documentation
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !annotationPrefixes.some((p) => line.startsWith(p)) &&
        !annotationExact.has(line),
    )
}

const ANNOTATION_PREFIXES = ['@z.', '@v.', '@a.', '@e.', '@t.', '@j.', '@p.', '@relation']
const ANNOTATION_EXACT = new Set(['@z', '@v', '@a', '@e', '@t', '@j', '@p'])

export function isAnnotationLine(line: string) {
  const trimmed = line.trim()
  return ANNOTATION_PREFIXES.some((p) => trimmed.startsWith(p)) || ANNOTATION_EXACT.has(trimmed)
}

export function stripAnnotations(doc: string | undefined) {
  if (!doc) return undefined
  const result = doc
    .split('\n')
    .filter((line) => !isAnnotationLine(line))
    .join('\n')
    .trim()
  return result.length > 0 ? result : undefined
}

export function isLoopbackHostname(hostname: string) {
  const bare = hostname.replace(/^\[(.*)\]$/u, '$1').toLowerCase()
  return (
    bare === 'localhost' || bare.endsWith('.localhost') || bare === '127.0.0.1' || bare === '::1'
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
  if (match.includes('strictObject')) return 'strict'
  return 'loose'
}

export function makeCommentBlock(lines: readonly string[], indent: number) {
  if (lines.length === 0) return ''
  const prefix = ' '.repeat(indent)
  return `${prefix}/**\n${lines.map((c) => `${prefix} * ${c}`).join('\n')}\n${prefix} */\n`
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
      (entry): entry is [string, (typeof validFields)[number][]] => entry[1] !== undefined,
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
