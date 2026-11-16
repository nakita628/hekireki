import type { Dialect } from '../../database/url.js'
import { quoteIdentifier } from '../../sql/index.js'

/** The dialect as far as the SQL it writes goes: CockroachDB is PostgreSQL that spells some apart. */
type Flavour = 'mysql' | 'sqlite' | 'postgresql' | 'cockroach'

function flavourOf(dialect: Dialect, cockroach: boolean): Flavour {
  if (dialect !== 'postgresql') return dialect
  return cockroach ? 'cockroach' : 'postgresql'
}

const UUID: { readonly [flavour in Flavour]: string } = {
  mysql: 'UUID()',
  sqlite:
    "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))",
  cockroach: 'gen_random_uuid()::STRING',
  postgresql: 'gen_random_uuid()::text',
}

const RANDOM_ID: { readonly [flavour in Flavour]: string } = {
  mysql: "REPLACE(UUID(), '-', '')",
  sqlite: 'lower(hex(randomblob(12)))',
  cockroach: 'md5(random()::STRING || now()::STRING)',
  postgresql: 'md5(random()::text || clock_timestamp()::text)',
}

const NOW: { readonly [dialect in Dialect]: string } = {
  mysql: 'CURRENT_TIMESTAMP(3)',
  sqlite: "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
  postgresql: 'CURRENT_TIMESTAMP',
}

/** The type text is cast to for each Prisma number type. */
const NUMBER_TYPES: { readonly [dialect in Dialect]: ReadonlyMap<string, string> } = {
  mysql: new Map([
    ['Int', 'SIGNED'],
    ['BigInt', 'SIGNED'],
    ['Float', 'DOUBLE'],
    ['Decimal', 'DECIMAL(65, 30)'],
  ]),
  sqlite: new Map([
    ['Int', 'INTEGER'],
    ['BigInt', 'INTEGER'],
    ['Float', 'REAL'],
    ['Decimal', 'REAL'],
  ]),
  postgresql: new Map([
    ['Int', 'INTEGER'],
    ['BigInt', 'BIGINT'],
    ['Float', 'DOUBLE PRECISION'],
    ['Decimal', 'DECIMAL(65, 30)'],
  ]),
}

/**
 * How each dialect writes what a suggestion or a fix needs of it.
 *
 * @example
 * ```sql
 * -- sqlOf('postgresql', false)
 * prefixed('user-', 'id')            'user-' || "id"
 * uuid                               gen_random_uuid()::text
 * randomId                           md5(random()::text || clock_timestamp()::text)
 * now                                CURRENT_TIMESTAMP
 * firstKey('User', 'public', 'id')   (SELECT MIN("id") FROM "public"."User")
 * number('views', 'Int')             CAST(NULLIF(TRIM("views"), '') AS INTEGER)
 *
 * -- sqlOf('mysql', false)
 * prefixed('user-', 'id')            CONCAT('user-', `id`)
 * uuid                               UUID()
 * randomId                           REPLACE(UUID(), '-', '')
 * now                                CURRENT_TIMESTAMP(3)
 * number('views', 'Int')             CAST(NULLIF(TRIM(`views`), '') AS SIGNED)
 *
 * -- sqlOf('sqlite', false)
 * randomId                           lower(hex(randomblob(12)))
 * now                                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 * falsy                              0
 * ```
 */
export function sqlOf(dialect: Dialect, cockroach: boolean) {
  const q = (name: string) => quoteIdentifier(dialect, name)
  const flavour = flavourOf(dialect, cockroach)
  return {
    q,
    /** A text prefix before the key of the row: `'slug-' || "id"`. */
    prefixed: (prefix: string, column: string) =>
      dialect === 'mysql'
        ? `CONCAT('${prefix}', ${q(column)})`
        : `'${prefix}' || ${q(column)}${cockroach ? '::STRING' : ''}`,
    uuid: UUID[flavour],
    randomId: RANDOM_ID[flavour],
    now: NOW[dialect],
    falsy: dialect === 'sqlite' ? '0' : 'FALSE',
    /** The smallest key of the table a foreign key points at: a row that is there. */
    firstKey: (table: string, schema: string | null, column: string) =>
      `(SELECT MIN(${q(column)}) FROM ${schema === null ? '' : `${q(schema)}.`}${q(table)})`,
    /** Text read as a number: blanks trimmed, an empty string as NULL. */
    number: (column: string, type: string) => {
      const target = NUMBER_TYPES[dialect].get(type)
      return target === undefined ? null : `CAST(NULLIF(TRIM(${q(column)}), '') AS ${target})`
    },
  }
}
