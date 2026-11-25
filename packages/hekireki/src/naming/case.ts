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

// The longest identifier each database keeps; the rest truncate at PostgreSQL's 63.
const IDENTIFIER_LIMITS: { readonly [provider: string]: number } = {
  sqlite: Infinity,
  mysql: 64,
  sqlserver: 128,
}

/** The text with its first character in lower case: a model's Prisma Client delegate, a label. */
export function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/**
 * The name Prisma Migrate gives a key, index or constraint the schema does not name: the table,
 * the columns and a suffix, the first two cut to the database's longest identifier (63 on
 * PostgreSQL, 64 on MySQL, 128 on SQL Server).
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
  const limit = IDENTIFIER_LIMITS[provider] ?? 63
  return `${[table, ...columns].join('_').slice(0, limit - suffix.length - 1)}_${suffix}`
}

/**
 * The part of a column an index takes: MySQL's `@@index([identifier(length: 191)])` on a TEXT. A
 * length the column does not reach is the whole of it, and MySQL keeps none: a String is
 * `varchar(191)` and a Bytes `longblob` unless its native type says otherwise.
 *
 * @example
 * ```sql
 * -- identifier String @db.Text, @@index([identifier(length: 191)])
 * CREATE INDEX `verification_identifier_idx` ON `verification`(`identifier`(191));
 * -- userId String, @@index([userId(length: 191)])
 * CREATE INDEX `account_userId_idx` ON `account`(`userId`);
 * -- data Bytes, @@index([data(length: 200)])
 * CREATE INDEX `blob_data_idx` ON `blob`(`data`(200));
 * ```
 */
export function indexPrefix(
  model: {
    readonly fields: readonly {
      readonly name: string
      readonly type: string
      readonly nativeType?: readonly [string, readonly string[]] | null
    }[]
  },
  field: { readonly name: string; readonly length?: number },
) {
  const modelField = model.fields.find((f) => f.name === field.name)
  const size = indexableLength(modelField?.type, modelField?.nativeType)
  return field.length === undefined || field.length >= size ? undefined : field.length
}

// How much of a column MySQL can index: the whole of a sized character or binary column, of a
// String with no native type (`varchar(191)`), and no end to any other (TEXT, BLOB, a Bytes with no
// native type, which is `longblob`).
function indexableLength(
  type: string | undefined,
  native: readonly [string, readonly string[]] | null | undefined,
) {
  if (native === null || native === undefined) return type === 'String' ? 191 : Infinity
  return ['VarChar', 'Char', 'VarBinary', 'Binary'].includes(native[0])
    ? Number(native[1][0] ?? 1)
    : Infinity
}
