import { quoteIdentifier } from '../../sql/index.js'
import { stringLiteral } from './dialect.js'

/**
 * The columns of the current schema whose type is an enum, or an array of one. A copy that keeps
 * such a type depends on it, and PostgreSQL then refuses the `DROP TYPE` Prisma ends every change
 * of an enum with: a backup must not be what makes the next migration fail.
 */
export const POSTGRES_ENUM_COLUMNS = {
  sql: `SELECT c.relname AS "table", a.attname AS "column", (e.oid IS NOT NULL) AS "array" FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_type t ON t.oid = a.atttypid LEFT JOIN pg_type e ON e.oid = t.typelem AND t.typcategory = 'A' WHERE n.nspname = current_schema() AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND (t.typtype = 'e' OR e.typtype = 'e')`,
  params: [],
}

/**
 * A backup on PostgreSQL: a schema named for it, with a copy of every table of the default one.
 * The rows are what is kept; a column of an enum is copied as the text of its labels, so that
 * nothing in the backup depends on a type the next migration may drop.
 *
 * @example
 * ```sql
 * CREATE SCHEMA "backup_20260201093000123";
 * CREATE TABLE "backup_20260201093000123"."User" AS
 *   SELECT "id", "role"::text AS "role", "tags"::text[] AS "tags" FROM "public"."User";
 * CREATE TABLE "backup_20260201093000123"."Post" AS SELECT "id", "title" FROM "public"."Post"
 * ```
 *
 * @param input - the backup's name, the schema the tables are in, the tables with their columns,
 *   and the columns of an enum among them
 * @returns the statements, in order
 */
export function postgresBackupStatements(input: {
  readonly name: string
  readonly schema: string
  readonly tables: readonly { readonly table: string; readonly columns: readonly string[] }[]
  readonly enumColumns: readonly {
    readonly table: string
    readonly column: string
    readonly array: boolean
  }[]
}) {
  const backup = quoteIdentifier('postgresql', input.name)
  return [
    `CREATE SCHEMA ${backup}`,
    ...input.tables.map((table) => {
      const columns = table.columns.map((column) => {
        const found = input.enumColumns.find(
          (one) => one.table === table.table && one.column === column,
        )
        const name = quoteIdentifier('postgresql', column)
        return found === undefined ? name : `${name}::text${found.array ? '[]' : ''} AS ${name}`
      })
      const name = quoteIdentifier('postgresql', table.table)
      return `CREATE TABLE ${backup}.${name} AS SELECT ${columns.join(', ')} FROM ${quoteIdentifier('postgresql', input.schema)}.${name}`
    }),
  ]
}

/**
 * What a restore has to make again, read from the catalogue when the backup is taken: every table
 * of the current schema column by column, the enums, the sequences columns own, the constraints,
 * the indexes no constraint made, and the triggers. PostgreSQL writes each definition itself
 * (`format_type`, `pg_get_expr`, `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_triggerdef`),
 * so what is run again is what it said, not a reading of it.
 */
export const POSTGRES_RESTORE_CATALOGUE = {
  columns: {
    sql: `SELECT c.relname AS "table", a.attname AS "column", format_type(a.atttypid, a.atttypmod) AS "type", a.attnotnull AS "notNull", pg_get_expr(d.adbin, d.adrelid) AS "default", a.attidentity AS "identity", a.attgenerated AS "generated", CASE WHEN a.attcollation <> t.typcollation THEN (SELECT quote_ident(l.collname) FROM pg_collation l WHERE l.oid = a.attcollation) END AS "collation", (t.typtype = 'e' OR COALESCE(e.typtype = 'e', false)) AS "isEnum" FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_type t ON t.oid = a.atttypid LEFT JOIN pg_type e ON e.oid = t.typelem AND t.typcategory = 'A' LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE n.nspname = current_schema() AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attnum`,
    params: [],
  },
  enums: {
    sql: `SELECT t.typname AS "name", e.enumlabel AS "label" FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = current_schema() ORDER BY t.typname, e.enumsortorder`,
    params: [],
  },
  sequences: {
    sql: `SELECT s.relname AS "name", format_type(q.seqtypid, NULL) AS "type", q.seqstart::text AS "start", q.seqincrement::text AS "increment", q.seqmin::text AS "min", q.seqmax::text AS "max", q.seqcache::text AS "cache", q.seqcycle AS "cycle", t.relname AS "table", a.attname AS "column", (d.deptype = 'i') AS "identity", p.last_value::text AS "last" FROM pg_sequence q JOIN pg_class s ON s.oid = q.seqrelid JOIN pg_namespace n ON n.oid = s.relnamespace JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i') JOIN pg_class t ON t.oid = d.refobjid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid LEFT JOIN pg_sequences p ON p.schemaname = n.nspname AND p.sequencename = s.relname WHERE n.nspname = current_schema() ORDER BY s.relname`,
    params: [],
  },
  constraints: {
    sql: `SELECT t.relname AS "table", c.conname AS "name", (c.contype = 'f') AS "foreign", pg_get_constraintdef(c.oid) AS "definition" FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = current_schema() AND t.relkind = 'r' ORDER BY t.relname, c.conname`,
    params: [],
  },
  indexes: {
    sql: `SELECT pg_get_indexdef(i.indexrelid) AS "definition" FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = current_schema() AND t.relkind = 'r' AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid) ORDER BY 1`,
    params: [],
  },
  triggers: {
    sql: `SELECT pg_get_triggerdef(g.oid) AS "definition" FROM pg_trigger g JOIN pg_class t ON t.oid = g.tgrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE NOT g.tgisinternal AND n.nspname = current_schema() ORDER BY 1`,
    params: [],
  },
}

/**
 * The statements that make the schema again as it was when the backup was taken, and bring the
 * rows back from the backup's copies: written then, kept in the backup, and run by a restore once
 * the tables there are now have been dropped. In the order they depend on each other: the enums
 * and the sequences a default reads, the tables, their rows (an enum read back from the text it
 * was kept as), the sequences given to their columns and set to where they were, the keys and
 * CHECKs, the foreign keys once every table has its rows, the indexes and the triggers.
 *
 * @example
 * ```sql
 * CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'EDITOR');
 * CREATE SEQUENCE "public"."User_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1;
 * CREATE TABLE "public"."User" ("id" integer DEFAULT nextval('"User_id_seq"'::regclass) NOT NULL, "role" "Role" NOT NULL);
 * INSERT INTO "public"."User" ("id", "role") SELECT "id", "role"::"Role" FROM "backup_20260201093000123"."User";
 * ALTER SEQUENCE "public"."User_id_seq" OWNED BY "public"."User"."id";
 * SELECT setval(pg_get_serial_sequence('"public"."User"', 'id'), 42, true);
 * ALTER TABLE "public"."User" ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);
 * ALTER TABLE "public"."Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id);
 * CREATE INDEX "Post_title_idx" ON public."Post" USING btree (title)
 * ```
 *
 * @param input - the backup's name, the schema, and the rows of `POSTGRES_RESTORE_CATALOGUE`
 * @returns the statements, in the order they have to run
 */
export function postgresRestoreStatements(input: {
  readonly name: string
  readonly schema: string
  readonly columns: readonly {
    readonly table: string
    readonly column: string
    readonly type: string
    readonly notNull: boolean
    readonly default: string | null
    /** `a` for GENERATED ALWAYS AS IDENTITY, `d` for BY DEFAULT, empty for neither. */
    readonly identity: string
    /** `s` for a stored generated column, whose `default` is what it is generated from. */
    readonly generated: string
    readonly collation: string | null
    readonly isEnum: boolean
  }[]
  readonly enums: readonly { readonly name: string; readonly label: string }[]
  readonly sequences: readonly {
    readonly name: string
    readonly type: string
    readonly start: string
    readonly increment: string
    readonly min: string
    readonly max: string
    readonly cache: string
    readonly cycle: boolean
    readonly table: string
    readonly column: string
    /** Made by the identity column itself, rather than one a `serial` default reads. */
    readonly identity: boolean
    /** Where it had got to; null when it had never been asked for a value. */
    readonly last: string | null
  }[]
  readonly constraints: readonly {
    readonly table: string
    readonly name: string
    readonly foreign: boolean
    readonly definition: string
  }[]
  readonly indexes: readonly string[]
  readonly triggers: readonly string[]
}) {
  const schema = quoteIdentifier('postgresql', input.schema)
  const backup = quoteIdentifier('postgresql', input.name)
  const tables = [...new Set(input.columns.map((column) => column.table))]
  const named = (name: string) => `${schema}.${quoteIdentifier('postgresql', name)}`
  const constraint = (one: (typeof input.constraints)[number]) =>
    `ALTER TABLE ${named(one.table)} ADD CONSTRAINT ${quoteIdentifier('postgresql', one.name)} ${one.definition}`
  return [
    ...[...new Set(input.enums.map((one) => one.name))].map(
      (name) =>
        `CREATE TYPE ${named(name)} AS ENUM (${input.enums
          .filter((one) => one.name === name)
          .map((one) => stringLiteral('postgresql', one.label))
          .join(', ')})`,
    ),
    ...input.sequences
      .filter((sequence) => !sequence.identity)
      .map(
        (sequence) =>
          `CREATE SEQUENCE ${named(sequence.name)} AS ${sequence.type} START WITH ${sequence.start} INCREMENT BY ${sequence.increment} MINVALUE ${sequence.min} MAXVALUE ${sequence.max} CACHE ${sequence.cache}${sequence.cycle ? ' CYCLE' : ''}`,
      ),
    ...tables.map((table) => {
      const columns = input.columns.filter((column) => column.table === table)
      const definitions = columns.map((column) => {
        const value =
          column.generated === 's'
            ? ` GENERATED ALWAYS AS (${column.default ?? 'NULL'}) STORED`
            : column.identity === ''
              ? column.default === null
                ? ''
                : ` DEFAULT ${column.default}`
              : ` GENERATED ${column.identity === 'a' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`
        return `${quoteIdentifier('postgresql', column.column)} ${column.type}${column.collation === null ? '' : ` COLLATE ${column.collation}`}${value}${column.notNull ? ' NOT NULL' : ''}`
      })
      return `CREATE TABLE ${named(table)} (${definitions.join(', ')})`
    }),
    ...tables.map((table) => {
      // A generated column is worked out again; an identity ALWAYS takes a value only when told to.
      const columns = input.columns.filter(
        (column) => column.table === table && column.generated === '',
      )
      const names = columns.map((column) => quoteIdentifier('postgresql', column.column))
      const values = columns.map((column) =>
        column.isEnum
          ? `${quoteIdentifier('postgresql', column.column)}::${column.type}`
          : quoteIdentifier('postgresql', column.column),
      )
      const overriding = columns.some((column) => column.identity === 'a')
        ? ' OVERRIDING SYSTEM VALUE'
        : ''
      return `INSERT INTO ${named(table)} (${names.join(', ')})${overriding} SELECT ${values.join(', ')} FROM ${backup}.${quoteIdentifier('postgresql', table)}`
    }),
    ...input.sequences
      .filter((sequence) => !sequence.identity)
      .map(
        (sequence) =>
          `ALTER SEQUENCE ${named(sequence.name)} OWNED BY ${named(sequence.table)}.${quoteIdentifier('postgresql', sequence.column)}`,
      ),
    ...input.sequences.flatMap((sequence) =>
      sequence.last === null
        ? []
        : [
            `SELECT setval(pg_get_serial_sequence(${stringLiteral('postgresql', named(sequence.table))}, ${stringLiteral('postgresql', sequence.column)}), ${sequence.last}, true)`,
          ],
    ),
    ...input.constraints.filter((one) => !one.foreign).map(constraint),
    ...input.constraints.filter((one) => one.foreign).map(constraint),
    ...input.indexes,
    ...input.triggers,
  ]
}

/**
 * What a restore takes away first: the foreign keys, so the tables can go in any order, then
 * every table of the schema, then its enums. Nothing is dropped with `CASCADE`: a view, a function
 * or anything else the backup does not know how to make again holds its table, PostgreSQL refuses
 * the drop, and the restore is rolled back whole rather than taking that with it.
 *
 * @example
 * ```sql
 * ALTER TABLE "public"."Post" DROP CONSTRAINT "Post_authorId_fkey";
 * DROP TABLE "public"."Post";
 * DROP TABLE "public"."User";
 * DROP TYPE "public"."Role"
 * ```
 */
export function postgresClearStatements(input: {
  readonly schema: string
  readonly tables: readonly string[]
  readonly foreignKeys: readonly { readonly table: string; readonly name: string }[]
  readonly enums: readonly string[]
}) {
  const schema = quoteIdentifier('postgresql', input.schema)
  return [
    ...input.foreignKeys.map(
      (key) =>
        `ALTER TABLE ${schema}.${quoteIdentifier('postgresql', key.table)} DROP CONSTRAINT ${quoteIdentifier('postgresql', key.name)}`,
    ),
    ...input.tables.map((table) => `DROP TABLE ${schema}.${quoteIdentifier('postgresql', table)}`),
    ...input.enums.map((name) => `DROP TYPE ${schema}.${quoteIdentifier('postgresql', name)}`),
  ]
}
