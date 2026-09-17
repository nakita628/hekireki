import { describe, expect, it } from 'vite-plus/test'

import {
  postgresBackupStatements,
  postgresClearStatements,
  postgresRestoreStatements,
} from './backup.js'

describe('postgresBackupStatements', () => {
  it('copies every table into a schema of its own, an enum as the text of its labels', () => {
    expect(
      postgresBackupStatements({
        name: 'backup_20260201093000123',
        schema: 'public',
        tables: [
          { table: 'User', columns: ['id', 'role', 'tags'] },
          { table: 'Post', columns: ['id', 'title'] },
        ],
        enumColumns: [
          { table: 'User', column: 'role', array: false },
          { table: 'User', column: 'tags', array: true },
        ],
      }),
    ).toStrictEqual([
      'CREATE SCHEMA "backup_20260201093000123"',
      'CREATE TABLE "backup_20260201093000123"."User" AS SELECT "id", "role"::text AS "role", "tags"::text[] AS "tags" FROM "public"."User"',
      'CREATE TABLE "backup_20260201093000123"."Post" AS SELECT "id", "title" FROM "public"."Post"',
    ])
  })
})

describe('postgresRestoreStatements', () => {
  const column = (over: {
    readonly table: string
    readonly column: string
    readonly type: string
    readonly notNull?: boolean
    readonly default?: string | null
    readonly identity?: string
    readonly generated?: string
    readonly isEnum?: boolean
  }) => ({
    notNull: true,
    default: null,
    identity: '',
    generated: '',
    collation: null,
    isEnum: false,
    ...over,
  })

  it('makes the schema again in the order its parts depend on each other, the rows read back from the backup', () => {
    expect(
      postgresRestoreStatements({
        name: 'backup_1',
        schema: 'public',
        columns: [
          column({ table: 'Post', column: 'id', type: 'integer' }),
          column({ table: 'Post', column: 'authorId', type: 'integer' }),
          column({
            table: 'User',
            column: 'id',
            type: 'integer',
            default: `nextval('"User_id_seq"'::regclass)`,
          }),
          column({ table: 'User', column: 'email', type: 'text' }),
          column({
            table: 'User',
            column: 'role',
            type: '"Role"',
            default: `'VIEWER'::"Role"`,
            isEnum: true,
          }),
        ],
        enums: [
          { name: 'Role', label: 'ADMIN' },
          { name: 'Role', label: "it's" },
        ],
        sequences: [
          {
            name: 'User_id_seq',
            type: 'integer',
            start: '1',
            increment: '1',
            min: '1',
            max: '2147483647',
            cache: '1',
            cycle: false,
            table: 'User',
            column: 'id',
            identity: false,
            last: '2',
          },
        ],
        constraints: [
          {
            table: 'Post',
            name: 'Post_authorId_fkey',
            foreign: true,
            definition: 'FOREIGN KEY ("authorId") REFERENCES "User"(id)',
          },
          { table: 'User', name: 'User_pkey', foreign: false, definition: 'PRIMARY KEY (id)' },
        ],
        indexes: ['CREATE INDEX "User_email_idx" ON public."User" USING btree (email)'],
        triggers: [],
      }),
    ).toStrictEqual([
      `CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'it''s')`,
      'CREATE SEQUENCE "public"."User_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1',
      'CREATE TABLE "public"."Post" ("id" integer NOT NULL, "authorId" integer NOT NULL)',
      `CREATE TABLE "public"."User" ("id" integer DEFAULT nextval('"User_id_seq"'::regclass) NOT NULL, "email" text NOT NULL, "role" "Role" DEFAULT 'VIEWER'::"Role" NOT NULL)`,
      'INSERT INTO "public"."Post" ("id", "authorId") SELECT "id", "authorId" FROM "backup_1"."Post"',
      'INSERT INTO "public"."User" ("id", "email", "role") SELECT "id", "email", "role"::"Role" FROM "backup_1"."User"',
      'ALTER SEQUENCE "public"."User_id_seq" OWNED BY "public"."User"."id"',
      `SELECT setval(pg_get_serial_sequence('"public"."User"', 'id'), 2, true)`,
      'ALTER TABLE "public"."User" ADD CONSTRAINT "User_pkey" PRIMARY KEY (id)',
      'ALTER TABLE "public"."Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id)',
      'CREATE INDEX "User_email_idx" ON public."User" USING btree (email)',
    ])
  })

  it('writes an identity and a generated column as the database made them, and copies neither value it would refuse', () => {
    expect(
      postgresRestoreStatements({
        name: 'backup_1',
        schema: 'public',
        columns: [
          column({ table: 'Item', column: 'id', type: 'integer', identity: 'a' }),
          column({ table: 'Item', column: 'price', type: 'integer' }),
          column({
            table: 'Item',
            column: 'double',
            type: 'integer',
            notNull: false,
            default: '(price * 2)',
            generated: 's',
          }),
        ],
        enums: [],
        sequences: [],
        constraints: [],
        indexes: [],
        triggers: [],
      }),
    ).toStrictEqual([
      'CREATE TABLE "public"."Item" ("id" integer GENERATED ALWAYS AS IDENTITY NOT NULL, "price" integer NOT NULL, "double" integer GENERATED ALWAYS AS ((price * 2)) STORED)',
      'INSERT INTO "public"."Item" ("id", "price") OVERRIDING SYSTEM VALUE SELECT "id", "price" FROM "backup_1"."Item"',
    ])
  })
})

describe('postgresClearStatements', () => {
  it('drops the foreign keys, then the tables, then the enums, and nothing with CASCADE', () => {
    expect(
      postgresClearStatements({
        schema: 'public',
        tables: ['Post', 'User'],
        foreignKeys: [{ table: 'Post', name: 'Post_authorId_fkey' }],
        enums: ['Role'],
      }),
    ).toStrictEqual([
      'ALTER TABLE "public"."Post" DROP CONSTRAINT "Post_authorId_fkey"',
      'DROP TABLE "public"."Post"',
      'DROP TABLE "public"."User"',
      'DROP TYPE "public"."Role"',
    ])
  })
})
