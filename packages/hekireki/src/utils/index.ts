export function parseRelation(line: string) {
  const match = line.trim().match(/^@relation\s+(\w+)\.(\w+)\s+(\w+)\.(\w+)\s+(\w+-to-\w+)$/u)
  if (!match) return null
  const [, fromModel, fromField, toModel, toField, type] = match
  return { fromModel, fromField, toModel, toField, type }
}

export function getString(v: string | string[] | undefined) {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

export function getStrings(v: string | string[] | undefined) {
  return typeof v === 'string' ? [v] : Array.isArray(v) ? v : undefined
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

const ANNOTATION_PREFIXES = [
  '@z.',
  '@v.',
  '@a.',
  '@e.',
  '@t.',
  '@j.',
  '@p.',
  '@ar.',
  '@ecto.',
  '@relation',
]
const ANNOTATION_EXACT = new Set(['@z', '@v', '@a', '@e', '@t', '@j', '@p', '@ar', '@ecto'])

export function isAnnotationLine(line: string) {
  const trimmed = line.trim()
  return ANNOTATION_PREFIXES.some((p) => trimmed.startsWith(p)) || ANNOTATION_EXACT.has(trimmed)
}

export function stripAnnotations(doc: string | undefined) {
  const result = documentationLines(doc).join('\n').trim()
  return result.length > 0 ? result : undefined
}

/** The lines of a doc comment that are prose: annotation lines are dropped. */
export function documentationLines(doc: string | undefined) {
  return (doc ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !isAnnotationLine(line))
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
  }[],
  schemaBuilder: (modelName: string, fields: string, objectType?: 'strict' | 'loose') => string,
  propertiesGenerator: (
    fields: readonly {
      readonly documentation: string
      readonly modelName: string
      readonly fieldName: string
      readonly validation: string | null
      readonly isRequired: boolean
    }[],
  ) => string,
  objectType?: 'strict' | 'loose',
) {
  const modelName = modelFields[0].modelName
  const fields = propertiesGenerator(modelFields)
  return schemaBuilder(modelName, fields, objectType)
}

/** The items in runs of at most `size`, in order: a batch of rows per statement. */
export function chunks<T>(items: readonly T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )
}

/** Whether two lists hold the same items in the same order. */
export function isSameList(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/** The text with its first character in lower case: a model's Prisma Client delegate, a label. */
export function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/**
 * The name Prisma Migrate gives a key, index or constraint the schema does not name: the table,
 * the columns and a suffix, the first two cut to the database's longest identifier (63 on
 * PostgreSQL, 64 on MySQL).
 *
 * @example
 * ```sql
 * -- @@unique([s, i]) on Scalar; a foreign key on refs.comp_a, comp_b
 * CREATE UNIQUE INDEX "Scalar_s_i_key" ON "Scalar"("s", "i");
 * CONSTRAINT "refs_comp_a_comp_b_fkey" FOREIGN KEY ("comp_a", "comp_b") ...
 * ```
 */
export function constraintName(
  table: string,
  columns: readonly string[],
  suffix: string,
  provider: string,
) {
  const limit = provider === 'sqlite' ? Infinity : provider === 'mysql' ? 64 : 63
  return `${[table, ...columns].join('_').slice(0, limit - suffix.length - 1)}_${suffix}`
}

/**
 * The part of a column an index takes: MySQL's `@@index([identifier(length: 191)])` on a TEXT. A
 * length the column does not reach is the whole of it, and MySQL keeps none: a String is
 * `varchar(191)` unless its native type says otherwise.
 *
 * @example
 * ```sql
 * -- identifier String @db.Text, @@index([identifier(length: 191)])
 * CREATE INDEX `verification_identifier_idx` ON `verification`(`identifier`(191));
 * -- userId String, @@index([userId(length: 191)])
 * CREATE INDEX `account_userId_idx` ON `account`(`userId`);
 * ```
 */
export function indexPrefix(
  model: {
    readonly fields: readonly {
      readonly name: string
      readonly nativeType?: readonly [string, readonly string[]] | null
    }[]
  },
  field: { readonly name: string; readonly length?: number },
) {
  const native = model.fields.find((f) => f.name === field.name)?.nativeType
  const size = !native
    ? 191
    : native[0] === 'VarChar' || native[0] === 'Char'
      ? Number(native[1][0] ?? 1)
      : Infinity
  return field.length === undefined || field.length >= size ? undefined : field.length
}
