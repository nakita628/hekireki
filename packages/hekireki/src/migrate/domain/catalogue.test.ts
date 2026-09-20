import { describe, expect, it } from 'vite-plus/test'

import {
  makeMysqlTables,
  makePostgresTables,
  mysqlEnumValues,
  sqliteCheckClauses,
} from './catalogue.js'

describe('mysqlEnumValues', () => {
  it('reads the members of an enum column type, doubled quotes undone', () => {
    expect(mysqlEnumValues("enum('ADMIN','it''s')")).toStrictEqual(['ADMIN', "it's"])
    expect(mysqlEnumValues('varchar(191)')).toBeNull()
  })
})

describe('makePostgresTables', () => {
  it('groups catalogue rows into tables with enum labels, unique keys and foreign keys', () => {
    const tables = makePostgresTables({
      columns: [
        {
          schema: 'public',
          table: 'User',
          column: 'id',
          nullable: 'NO',
          type: 'integer',
          udtSchema: 'pg_catalog',
          udt: 'int4',
        },
        {
          schema: 'public',
          table: 'User',
          column: 'role',
          nullable: 'NO',
          type: 'USER-DEFINED',
          udtSchema: 'public',
          udt: 'Role',
        },
        {
          schema: 'public',
          table: 'User',
          column: 'tags',
          nullable: 'YES',
          type: 'ARRAY',
          udtSchema: 'pg_catalog',
          udt: '_text',
        },
        {
          schema: 'public',
          table: 'Post',
          column: 'authorId',
          nullable: 'YES',
          type: 'integer',
          udtSchema: 'pg_catalog',
          udt: 'int4',
        },
        {
          schema: 'public',
          table: '_prisma_migrations',
          column: 'id',
          nullable: 'NO',
          type: 'text',
          udtSchema: 'pg_catalog',
          udt: 'text',
        },
      ],
      enums: [
        { schema: 'public', name: 'Role', label: 'ADMIN' },
        { schema: 'public', name: 'Role', label: 'VIEWER' },
      ],
      uniques: [
        { schema: 'public', table: 'User', index: 'User_pkey', position: 1, column: 'id' },
        { schema: 'public', table: 'User', index: 'User_a_b_key', position: 1, column: 'a' },
        { schema: 'public', table: 'User', index: 'User_a_b_key', position: 2, column: 'b' },
      ],
      foreignKeys: [
        {
          schema: 'public',
          table: 'Post',
          name: 'Post_authorId_fkey',
          position: 1,
          column: 'authorId',
          refSchema: 'public',
          refTable: 'User',
          refColumn: 'id',
          validated: true,
        },
      ],
      triggers: [{ schema: 'public', table: 'User', name: 'User_audit' }],
      checks: [{ schema: 'public', table: 'User', name: 'User_a_check', clause: '(a >= 0)' }],
    })
    expect(tables).toStrictEqual([
      {
        schema: 'public',
        table: 'User',
        columns: [
          {
            name: 'id',
            nullable: false,
            dataType: 'integer',
            columnType: null,
            maxLength: null,
            precision: null,
            scale: null,
            datetimePrecision: null,
            enumValues: null,
            generated: false,
          },
          {
            name: 'role',
            nullable: false,
            dataType: 'USER-DEFINED',
            columnType: null,
            maxLength: null,
            precision: null,
            scale: null,
            datetimePrecision: null,
            enumValues: ['ADMIN', 'VIEWER'],
            generated: false,
          },
          {
            name: 'tags',
            nullable: true,
            dataType: 'text[]',
            columnType: null,
            maxLength: null,
            precision: null,
            scale: null,
            datetimePrecision: null,
            enumValues: null,
            generated: false,
          },
        ],
        triggers: ['User_audit'],
        checks: [{ name: 'User_a_check', clause: '(a >= 0)' }],
        uniques: [['id'], ['a', 'b']],
        foreignKeys: [],
      },
      {
        schema: 'public',
        table: 'Post',
        columns: [
          {
            name: 'authorId',
            nullable: true,
            dataType: 'integer',
            columnType: null,
            maxLength: null,
            precision: null,
            scale: null,
            datetimePrecision: null,
            enumValues: null,
            generated: false,
          },
        ],
        triggers: [],
        checks: [],
        uniques: [],
        foreignKeys: [
          {
            columns: ['authorId'],
            refSchema: 'public',
            refTable: 'User',
            refColumns: ['id'],
            enforced: true,
            onDelete: 'no action',
            onUpdate: 'no action',
          },
        ],
      },
    ])
  })
})

describe('makeMysqlTables', () => {
  it('reads enum members from column_type and trusts a declared foreign key', () => {
    const tables = makeMysqlTables({
      columns: [
        {
          table: 'User',
          column: 'role',
          nullable: 'NO',
          type: 'enum',
          full: "enum('ADMIN','VIEWER')",
          maxLength: 6,
        },
        { table: 'User', column: 'active', nullable: 'NO', type: 'tinyint', full: 'tinyint(1)' },
      ],
      uniques: [],
      foreignKeys: [
        {
          table: 'User',
          name: 'fk',
          position: 1,
          column: 'role',
          refTable: 'Other',
          refColumn: 'x',
        },
      ],
    })
    expect(tables[0]?.columns[0]?.enumValues).toStrictEqual(['ADMIN', 'VIEWER'])
    expect(tables[0]?.columns.map((c) => c.maxLength)).toStrictEqual([6, null])
    expect(tables[0]?.foreignKeys).toStrictEqual([
      {
        columns: ['role'],
        refSchema: null,
        refTable: 'Other',
        refColumns: ['x'],
        enforced: true,
        onDelete: 'no action',
        onUpdate: 'no action',
      },
    ])
  })
})

describe('what the schema does not describe', () => {
  it('reads a generated column and an identity only the database writes as ones no fix can set', () => {
    const [table] = makePostgresTables({
      columns: [
        {
          schema: 'public',
          table: 'Item',
          column: 'id',
          nullable: 'NO',
          type: 'integer',
          identity: 'ALWAYS',
        },
        {
          schema: 'public',
          table: 'Item',
          column: 'total',
          nullable: 'YES',
          type: 'integer',
          generated: 'ALWAYS',
        },
        {
          schema: 'public',
          table: 'Item',
          column: 'price',
          nullable: 'NO',
          type: 'integer',
          generated: 'NEVER',
        },
      ],
      enums: [],
      uniques: [],
      foreignKeys: [],
    })
    expect(table?.columns.map((column) => [column.name, column.generated])).toStrictEqual([
      ['id', true],
      ['total', true],
      ['price', false],
    ])
    const [mysql] = makeMysqlTables({
      columns: [
        {
          table: 'Item',
          column: 'total',
          nullable: 'YES',
          type: 'int',
          full: 'int',
          generation: '(`price` * 2)',
        },
        {
          table: 'Item',
          column: 'price',
          nullable: 'NO',
          type: 'int',
          full: 'int',
          generation: '',
        },
      ],
      uniques: [],
      foreignKeys: [],
      triggers: [{ table: 'Item', name: 'Item_audit' }],
      checks: [{ table: 'Item', name: 'Item_chk_1', clause: '(`price` >= 0)' }],
    })
    expect(mysql?.columns.map((column) => [column.name, column.generated])).toStrictEqual([
      ['total', true],
      ['price', false],
    ])
    expect([mysql?.triggers, mysql?.checks]).toStrictEqual([
      ['Item_audit'],
      [{ name: 'Item_chk_1', clause: '(`price` >= 0)' }],
    ])
  })

  it('takes the backslashes MySQL writes a CHECK clause with off, and leaves a clause of MariaDB as it is', () => {
    // As information_schema.check_constraints of MySQL 8.4 answers for `CHECK (name <> 'it''s')`.
    const reported = "(`name` <> _utf8mb4\\'it\\\\\\'s\\')"
    const columns = [{ table: 'T', column: 'name', nullable: 'YES', type: 'text', full: 'text' }]
    const checks = [{ table: 'T', name: 'T_chk', clause: reported }]
    const clauseOf = (escapedChecks: boolean) =>
      makeMysqlTables({ columns, uniques: [], foreignKeys: [], checks, escapedChecks })[0]
        ?.checks[0]?.clause
    expect(clauseOf(true)).toBe("(`name` <> _utf8mb4'it\\'s')")
    expect(clauseOf(false)).toBe(reported)
  })

  it('reads the CHECK constraints of a SQLite table from the statement it was made with', () => {
    expect(
      sqliteCheckClauses(
        `CREATE TABLE "User" ("id" INTEGER PRIMARY KEY, "age" INTEGER CHECK ("age" >= 0), "note" TEXT DEFAULT 'CHECK (x)', CONSTRAINT "span" CHECK ("age" < 200 AND ("note" IS NULL OR length("note") < 10)))`,
      ),
    ).toStrictEqual(['"age" >= 0', '"age" < 200 AND ("note" IS NULL OR length("note") < 10)'])
    expect(sqliteCheckClauses('CREATE TABLE "Plain" ("id" INTEGER)')).toStrictEqual([])
  })
})
