import { describe, expect, it } from 'vite-plus/test'

import { makeConversions } from './conversion.js'

function field(
  type: string,
  options: {
    readonly kind?: string
    readonly nativeType?: readonly [string, readonly string[]] | null
    readonly required?: boolean
    readonly databaseDefault?: boolean
    readonly isList?: boolean
  } = {},
) {
  return {
    column: 'x',
    type,
    kind: options.kind ?? 'scalar',
    nativeType: options.nativeType ?? null,
    isList: options.isList ?? false,
    required: options.required ?? false,
    databaseDefault: options.databaseDefault ?? false,
  }
}

function held(
  dataType: string,
  options: {
    readonly columnType?: string | null
    readonly maxLength?: number | null
    readonly precision?: number | null
    readonly scale?: number | null
    readonly datetimePrecision?: number | null
    readonly enumValues?: readonly string[] | null
  } = {},
) {
  return {
    dataType,
    columnType: options.columnType ?? null,
    maxLength: options.maxLength ?? null,
    precision: options.precision ?? null,
    scale: options.scale ?? null,
    datetimePrecision: options.datetimePrecision ?? null,
    enumValues: options.enumValues ?? null,
  }
}

function kindsOf(input: Parameters<typeof makeConversions>[0]) {
  return makeConversions(input).map((conversion) => `${conversion.kind} ${conversion.severity}`)
}

const RECREATED = 'column-recreated warning'
const OUT_OF_RANGE = 'value-out-of-range blocking'
const ROUNDED = 'value-rounded warning'

// Each case is what Prisma Migrate writes for the change (`prisma migrate diff`) and what the
// database does with it: PostgreSQL casts or drops and re-adds, MySQL MODIFYs in strict mode.
describe('makeConversions on PostgreSQL', () => {
  const dialect = 'postgresql'
  const cases: readonly (readonly [
    string,
    ReturnType<typeof field>,
    ReturnType<typeof held>,
    readonly string[],
  ])[] = [
    ['text to Int: re-added, the values lost', field('Int'), held('text'), [RECREATED]],
    [
      'text to a required Int: re-added NOT NULL with rows',
      field('Int', { required: true }),
      held('text'),
      ['column-recreated blocking'],
    ],
    [
      'text to a required Int with a default: filled',
      field('Int', { required: true, databaseDefault: true }),
      held('text'),
      [RECREATED],
    ],
    [
      'an enum to text: re-added',
      field('String'),
      held('USER-DEFINED', { enumValues: ['A'] }),
      [RECREATED],
    ],
    ['text to an enum: re-added', field('Role', { kind: 'enum' }), held('text'), [RECREATED]],
    [
      'an enum to an enum: cast, the enum check counts',
      field('Role', { kind: 'enum' }),
      held('USER-DEFINED', { enumValues: ['A'] }),
      [],
    ],
    [
      'text to @db.Uuid: re-added',
      field('String', { nativeType: ['Uuid', []] }),
      held('text'),
      [RECREATED],
    ],
    ['uuid to text: cast', field('String'), held('uuid'), []],
    [
      'uuid to VarChar(40): re-added',
      field('String', { nativeType: ['VarChar', ['40']] }),
      held('uuid'),
      [RECREATED],
    ],
    ['integer to text: cast', field('String'), held('integer'), []],
    ['integer to Boolean: re-added', field('Boolean'), held('integer'), [RECREATED]],
    ['bigint to Int: fails out of range', field('Int'), held('bigint'), [OUT_OF_RANGE]],
    [
      'double to Int: out of range fails, a fraction is rounded',
      field('Int'),
      held('double precision'),
      [OUT_OF_RANGE, ROUNDED],
    ],
    [
      'integer to SmallInt: fails out of range',
      field('Int', { nativeType: ['SmallInt', []] }),
      held('integer'),
      [OUT_OF_RANGE],
    ],
    ['smallint to Int: widens', field('Int'), held('smallint'), []],
    ['integer to BigInt: widens', field('BigInt'), held('integer'), []],
    ['bigint to Float: cast', field('Float'), held('bigint'), []],
    [
      'text to VarChar(10): fails when too long',
      field('String', { nativeType: ['VarChar', ['10']] }),
      held('text'),
      ['value-too-long blocking'],
    ],
    [
      'varchar(50) to VarChar(10): too long',
      field('String', { nativeType: ['VarChar', ['10']] }),
      held('character varying', { maxLength: 50 }),
      ['value-too-long blocking'],
    ],
    [
      'varchar(5) to VarChar(10): fits',
      field('String', { nativeType: ['VarChar', ['10']] }),
      held('character varying', { maxLength: 5 }),
      [],
    ],
    [
      'numeric(10,2) to Decimal(5,2): too many whole digits',
      field('Decimal', { nativeType: ['Decimal', ['5', '2']] }),
      held('numeric', { precision: 10, scale: 2 }),
      [OUT_OF_RANGE],
    ],
    [
      'numeric(10,4) to Decimal(10,2): rounded, six whole digits still fit',
      field('Decimal', { nativeType: ['Decimal', ['10', '2']] }),
      held('numeric', { precision: 10, scale: 4 }),
      [ROUNDED],
    ],
    [
      'numeric(5,3) to Decimal(5,2): rounded, the carry still fits',
      field('Decimal', { nativeType: ['Decimal', ['5', '2']] }),
      held('numeric', { precision: 5, scale: 3 }),
      [ROUNDED],
    ],
    [
      'numeric(4,2) to Decimal(10,2): fits',
      field('Decimal', { nativeType: ['Decimal', ['10', '2']] }),
      held('numeric', { precision: 4, scale: 2 }),
      [],
    ],
    [
      'integer to Decimal(4,0): too many digits',
      field('Decimal', { nativeType: ['Decimal', ['4', '0']] }),
      held('integer'),
      [OUT_OF_RANGE],
    ],
    ['smallint to a bare Decimal: DECIMAL(65,30) holds it', field('Decimal'), held('smallint'), []],
    [
      'numeric to Int: rounded to whole numbers',
      field('Int'),
      held('numeric', { precision: 5, scale: 2 }),
      [OUT_OF_RANGE, ROUNDED],
    ],
    [
      'timestamp to @db.Date: the time is dropped',
      field('DateTime', { nativeType: ['Date', []] }),
      held('timestamp without time zone', { datetimePrecision: 3 }),
      ['value-truncated warning'],
    ],
    [
      'date to @db.Date: nothing to drop',
      field('DateTime', { nativeType: ['Date', []] }),
      held('date'),
      [],
    ],
    [
      'timestamp(6) to DateTime: fractional seconds cut to 3',
      field('DateTime'),
      held('timestamp without time zone', { datetimePrecision: 6 }),
      [ROUNDED],
    ],
    [
      'timestamp(3) to DateTime: the same',
      field('DateTime'),
      held('timestamp without time zone', { datetimePrecision: 3 }),
      [],
    ],
    ['a list: left alone', field('Int', { isList: true }), held('text[]'), []],
  ]
  it.each(cases)('%s', (_, column, existing, expected) => {
    expect(kindsOf({ dialect, mariadb: false, column, existing })).toStrictEqual(expected)
  })

  it('counts every row of a column re-added NOT NULL, and the values of one re-added nullable', () => {
    const run = (column: ReturnType<typeof field>) =>
      makeConversions({ dialect, mariadb: false, column, existing: held('text') })[0]?.condition
    expect(run(field('Int', { required: true }))).toBeNull()
    expect(run(field('Int'))).toBe('"x" IS NOT NULL')
  })

  it('writes the bounds and the rounding as conditions on the value', () => {
    const [range] = makeConversions({
      dialect,
      mariadb: false,
      column: field('Int'),
      existing: held('bigint'),
    })
    expect(range).toMatchObject({
      what: 'values outside Int (-2147483648 to 2147483647)',
      condition: '("x" < -2147483648 OR "x" > 2147483647)',
      bounds: { min: '-2147483648', max: '2147483647' },
    })
    const decimal = makeConversions({
      dialect,
      mariadb: false,
      column: field('Decimal', { nativeType: ['Decimal', ['5', '2']] }),
      existing: held('double precision'),
    })
    expect(decimal.map((c) => [c.what, c.condition])).toStrictEqual([
      [
        'values outside Decimal @db.Decimal(5, 2) (-999.99 to 999.99)',
        '(ROUND(CAST("x" AS NUMERIC), 2) < -999.99 OR ROUND(CAST("x" AS NUMERIC), 2) > 999.99)',
      ],
      [
        'values rounded to 2 decimal places',
        'CAST("x" AS NUMERIC) <> ROUND(CAST("x" AS NUMERIC), 2)',
      ],
    ])
    const [length] = makeConversions({
      dialect,
      mariadb: false,
      column: field('String', { nativeType: ['VarChar', ['10']] }),
      existing: held('text'),
    })
    expect(length).toMatchObject({
      what: 'values longer than 10 characters',
      condition: 'CHAR_LENGTH("x") > 10',
      length: 10,
    })
  })
})

describe('makeConversions on MySQL', () => {
  const dialect = 'mysql'
  const cases: readonly (readonly [
    string,
    ReturnType<typeof field>,
    ReturnType<typeof held>,
    readonly string[],
  ])[] = [
    [
      'varchar to Int: fails on what is not an integer, rounds a fraction',
      field('Int'),
      held('varchar', { columnType: 'varchar(191)', maxLength: 191 }),
      ['value-not-convertible blocking', ROUNDED],
    ],
    [
      'varchar to Float: fails on what is not a number',
      field('Float'),
      held('varchar', { columnType: 'varchar(191)' }),
      ['value-not-convertible blocking'],
    ],
    [
      'varchar to Decimal: fails on what is not a number or out of range, rounds',
      field('Decimal'),
      held('varchar', { columnType: 'varchar(191)' }),
      ['value-not-convertible blocking', ROUNDED],
    ],
    [
      'varchar to DateTime: fails on what is not a date',
      field('DateTime'),
      held('varchar', { columnType: 'varchar(191)' }),
      ['value-not-convertible blocking'],
    ],
    [
      'varchar to Json: fails on invalid JSON',
      field('Json'),
      held('varchar', { columnType: 'varchar(191)' }),
      ['value-not-convertible blocking'],
    ],
    [
      'bigint to Int: out of range',
      field('Int'),
      held('bigint', { columnType: 'bigint' }),
      [OUT_OF_RANGE],
    ],
    [
      'int unsigned to Int: out of range',
      field('Int'),
      held('int', { columnType: 'int(10) unsigned' }),
      [OUT_OF_RANGE],
    ],
    [
      'int to Boolean: tinyint(1) range',
      field('Boolean'),
      held('int', { columnType: 'int' }),
      [OUT_OF_RANGE],
    ],
    [
      'tinyint(1) to Boolean: fits',
      field('Boolean'),
      held('tinyint', { columnType: 'tinyint(1)' }),
      [],
    ],
    ['int to BigInt: widens', field('BigInt'), held('int', { columnType: 'int' }), []],
    [
      'double to Int: out of range fails, a fraction is rounded',
      field('Int'),
      held('double', { columnType: 'double' }),
      [OUT_OF_RANGE, ROUNDED],
    ],
    [
      'decimal(10,2) to Decimal(5,2): too many whole digits',
      field('Decimal', { nativeType: ['Decimal', ['5', '2']] }),
      held('decimal', { columnType: 'decimal(10,2)', precision: 10, scale: 2 }),
      [OUT_OF_RANGE],
    ],
    [
      'double to Decimal(5,2): out of range fails, rounded',
      field('Decimal', { nativeType: ['Decimal', ['5', '2']] }),
      held('double', { columnType: 'double' }),
      [OUT_OF_RANGE, ROUNDED],
    ],
    ['int to String: fits VARCHAR(191)', field('String'), held('int', { columnType: 'int' }), []],
    [
      'longtext to String: VARCHAR(191) can be too short',
      field('String'),
      held('longtext', { columnType: 'longtext', maxLength: 4_294_967_295 }),
      ['value-too-long blocking'],
    ],
    [
      'varchar(100) to String: fits VARCHAR(191)',
      field('String'),
      held('varchar', { columnType: 'varchar(100)', maxLength: 100 }),
      [],
    ],
    [
      'varchar(191) to @db.Text: fits',
      field('String', { nativeType: ['Text', []] }),
      held('varchar', { columnType: 'varchar(191)', maxLength: 191 }),
      [],
    ],
    [
      'varchar to an enum: the enum check counts',
      field('Role', { kind: 'enum' }),
      held('varchar', { columnType: 'varchar(191)' }),
      [],
    ],
    [
      'datetime(3) to @db.Date: the time is dropped',
      field('DateTime', { nativeType: ['Date', []] }),
      held('datetime', { columnType: 'datetime(3)', datetimePrecision: 3 }),
      ['value-truncated warning'],
    ],
    [
      'datetime(6) to DateTime: fractional seconds cut to 3',
      field('DateTime'),
      held('datetime', { columnType: 'datetime(6)', datetimePrecision: 6 }),
      [ROUNDED],
    ],
    [
      'datetime to Int: not modelled',
      field('Int'),
      held('datetime', { columnType: 'datetime(3)' }),
      ['column-type warning'],
    ],
  ]
  it.each(cases)('%s', (_, column, existing, expected) => {
    expect(kindsOf({ dialect, mariadb: false, column, existing })).toStrictEqual(expected)
  })

  it('counts the strings MySQL cannot round into an integer, and those out of range once rounded', () => {
    expect(
      makeConversions({
        dialect,
        mariadb: false,
        column: field('Int'),
        existing: held('varchar', { columnType: 'varchar(191)' }),
      })[0]?.condition,
    ).toBe(
      "`x` IS NOT NULL AND (`x` NOT REGEXP '^[[:space:]]*[-+]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][-+]?[0-9]*)?[[:space:]]*$' OR ROUND(CAST(`x` AS DECIMAL(65, 30))) < -2147483648 OR ROUND(CAST(`x` AS DECIMAL(65, 30))) > 2147483647)",
    )
  })

  it('counts every string that is not digits on MariaDB, which refuses 10.5 as an integer', () => {
    expect(
      makeConversions({
        dialect,
        mariadb: true,
        column: field('Int'),
        existing: held('varchar', { columnType: 'varchar(191)' }),
      })[0]?.condition,
    ).toBe(
      "`x` IS NOT NULL AND (`x` NOT REGEXP '^[[:space:]]*[-+]?[0-9]+[[:space:]]*$' OR CAST(`x` AS DECIMAL(65, 0)) < -2147483648 OR CAST(`x` AS DECIMAL(65, 0)) > 2147483647)",
    )
  })

  it('rounds a double by its shortest decimal form, as MODIFY does', () => {
    const [range] = makeConversions({
      dialect,
      mariadb: false,
      column: field('Decimal', { nativeType: ['Decimal', ['5', '2']] }),
      existing: held('double', { columnType: 'double' }),
    })
    expect(range?.condition).toBe(
      '(ROUND(CAST(CAST(`x` AS CHAR) AS DECIMAL(65, 30)), 2) < -999.99 OR ROUND(CAST(CAST(`x` AS CHAR) AS DECIMAL(65, 30)), 2) > 999.99)',
    )
  })
})

// CockroachDB, as its catalogue names the types: Prisma drops and adds a column again for every
// change but BIGINT to INT4 and INT4 to an unbounded STRING, which it makes in place.
describe('makeConversions on CockroachDB', () => {
  const dialect = 'postgresql'
  const cases: readonly (readonly [
    string,
    ReturnType<typeof field>,
    ReturnType<typeof held>,
    readonly string[],
  ])[] = [
    ['INT8 to Int: in place, fails out of range', field('Int'), held('bigint'), [OUT_OF_RANGE]],
    ['INT4 to String: in place', field('String'), held('integer'), []],
    ['INT4 to Int: unchanged', field('Int'), held('integer'), []],
    ['INT2 to String: re-added', field('String'), held('smallint'), [RECREATED]],
    ['INT8 to String: re-added', field('String'), held('bigint'), [RECREATED]],
    ['STRING to BigInt: re-added', field('BigInt'), held('text'), [RECREATED]],
    ['FLOAT8 to Int: re-added', field('Int'), held('double precision'), [RECREATED]],
    [
      'STRING(10) to String: re-added',
      field('String'),
      held('character varying', { maxLength: 10 }),
      [RECREATED],
    ],
    [
      'STRING to String(5): re-added',
      field('String', { nativeType: ['String', ['5']] }),
      held('text'),
      [RECREATED],
    ],
    [
      'STRING(10) to String(10): unchanged',
      field('String', { nativeType: ['String', ['10']] }),
      held('character varying', { maxLength: 10 }),
      [],
    ],
    [
      'an enum to an enum: DROP VALUE, the enum check counts',
      field('Role', { kind: 'enum' }),
      held('USER-DEFINED', { enumValues: ['A'] }),
      [],
    ],
    ['STRING to an enum: re-added', field('Role', { kind: 'enum' }), held('text'), [RECREATED]],
  ]
  it.each(cases)('%s', (_, column, existing, expected) => {
    expect(kindsOf({ dialect, mariadb: false, cockroach: true, column, existing })).toStrictEqual(
      expected,
    )
  })
})

describe('makeConversions on SQLite', () => {
  const dialect = 'sqlite'
  const cases: readonly (readonly [
    string,
    ReturnType<typeof field>,
    ReturnType<typeof held>,
    readonly string[],
  ])[] = [
    ['TEXT to Int: copied as it is', field('Int'), held('TEXT'), ['column-type warning']],
    [
      'INTEGER to String: copied as it is',
      field('String'),
      held('INTEGER'),
      ['column-type warning'],
    ],
    ['INTEGER to BigInt: the same storage', field('BigInt'), held('INTEGER'), []],
    ['TEXT to an enum: the enum check counts', field('Role', { kind: 'enum' }), held('TEXT'), []],
  ]
  it.each(cases)('%s', (_, column, existing, expected) => {
    expect(kindsOf({ dialect, mariadb: false, column, existing })).toStrictEqual(expected)
  })
})
