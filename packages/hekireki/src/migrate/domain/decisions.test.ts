import { describe, expect, it } from 'vite-plus/test'
import type * as z from 'zod'

import { CHOICES, Decision, formatMapping, makeDecisionModels, parseMapping } from './decisions.js'

const decision = (over: Partial<z.input<typeof Decision>>) =>
  Decision.parse({
    kind: 'not-null',
    modelName: 'User',
    field: 'name',
    choice: 'value',
    value: null,
    ...over,
  })

describe('makeDecisionModels', () => {
  it('fills NULLs with a value, or with SQL when that is what was chosen', () => {
    expect(makeDecisionModels([decision({ value: 'unknown' })])).toStrictEqual({
      User: { fields: { name: { nulls: 'unknown' } } },
    })
    expect(
      makeDecisionModels([decision({ choice: 'sql', value: 'substr(email, 1, 3)' })]),
    ).toStrictEqual({ User: { fields: { name: { nulls: { sql: 'substr(email, 1, 3)' } } } } })
  })

  it('puts a move on the field it moved to, in the model it moved to', () => {
    expect(
      makeDecisionModels([
        decision({ kind: 'column-dropped', field: 'bio', choice: 'move', value: 'Profile.bio' }),
      ]),
    ).toStrictEqual({
      Profile: { fields: { bio: { movedFrom: { model: 'User', column: 'bio' } } } },
    })
    // A move that names no field of a model moves nothing.
    expect(
      makeDecisionModels([
        decision({ kind: 'column-dropped', field: 'bio', choice: 'move', value: 'Profile' }),
      ]),
    ).toStrictEqual({ Profile: { fields: {} } })
  })

  it('reads a duplicates choice as which row stays and what becomes of the rest', () => {
    expect(
      makeDecisionModels([
        decision({ kind: 'unique', field: 'email', choice: 'keep-first-delete' }),
      ]),
    ).toStrictEqual({
      User: { fields: { email: { duplicates: { keep: 'first', others: 'delete' } } } },
    })
    expect(
      makeDecisionModels([decision({ kind: 'unique', field: 'email', choice: 'keep-last-null' })]),
    ).toStrictEqual({
      User: { fields: { email: { duplicates: { keep: 'last', others: 'null' } } } },
    })
  })

  it('orders the duplicates by the field named, and by the primary key when none is', () => {
    expect(
      makeDecisionModels([
        decision({
          kind: 'unique',
          field: 'email',
          choice: 'keep-last-delete',
          value: 'createdAt',
        }),
      ]),
    ).toStrictEqual({
      User: {
        fields: { email: { duplicates: { keep: 'last', orderBy: 'createdAt', others: 'delete' } } },
      },
    })
    expect(
      makeDecisionModels([
        decision({ kind: 'unique', field: 'email', choice: 'keep-last-delete', value: ' ' }),
      ]),
    ).toStrictEqual({
      User: { fields: { email: { duplicates: { keep: 'last', others: 'delete' } } } },
    })
  })

  it('puts a foreign key under relations, which is where the config keeps it', () => {
    expect(
      makeDecisionModels([
        decision({ kind: 'foreign-key', modelName: 'Post', field: 'category', choice: 'null' }),
      ]),
    ).toStrictEqual({ Post: { relations: { category: { orphans: 'null' } } } })
  })

  it('says what becomes of a value the column can no longer hold', () => {
    expect(
      makeDecisionModels([decision({ kind: 'value-too-long', choice: 'truncate' })]),
    ).toStrictEqual({ User: { fields: { name: { invalid: 'truncate' } } } })
    expect(
      makeDecisionModels([decision({ kind: 'value-out-of-range', field: 'age', choice: 'clamp' })]),
    ).toStrictEqual({ User: { fields: { age: { invalid: 'clamp' } } } })
  })

  it('replaces a value the column can no longer hold with a value, or with SQL', () => {
    expect(
      makeDecisionModels([
        decision({ kind: 'value-out-of-range', field: 'age', choice: 'value', value: '0' }),
      ]),
    ).toStrictEqual({ User: { fields: { age: { invalid: { set: '0' } } } } })
    expect(
      makeDecisionModels([
        decision({ kind: 'value-not-convertible', field: 'age', choice: 'sql', value: 'id % 100' }),
      ]),
    ).toStrictEqual({ User: { fields: { age: { invalid: { set: { sql: 'id % 100' } } } } } })
  })

  it('keeps every decision about one field, not only the last', () => {
    expect(
      makeDecisionModels([
        decision({ field: 'age', value: '0' }),
        decision({ kind: 'value-out-of-range', field: 'age', choice: 'clamp' }),
      ]),
    ).toStrictEqual({ User: { fields: { age: { nulls: '0', invalid: 'clamp' } } } })
  })

  it('gathers every decision of a model into the one entry', () => {
    expect(
      makeDecisionModels([
        decision({ value: 'unknown' }),
        decision({ kind: 'unique', field: 'email', choice: 'keep-first-delete' }),
        decision({ kind: 'foreign-key', field: 'author', choice: 'delete' }),
      ]),
    ).toStrictEqual({
      User: {
        fields: {
          name: { nulls: 'unknown' },
          email: { duplicates: { keep: 'first', others: 'delete' } },
        },
        relations: { author: { orphans: 'delete' } },
      },
    })
  })

  // A rename and an enum mapping are what keeps data a migration would otherwise take with it.
  it('keeps a column the schema renamed, putting the fix on the field it became', () => {
    expect(
      makeDecisionModels([
        decision({ kind: 'column-dropped', field: 'name', choice: 'rename', value: 'fullName' }),
      ]),
    ).toStrictEqual({ User: { fields: { fullName: { renamedFrom: 'name' } } } })
  })

  it('drops a column when that is what was chosen, which is a decision and not a fix', () => {
    expect(
      makeDecisionModels([
        decision({ kind: 'column-dropped', field: 'name', choice: 'drop', value: null }),
      ]),
    ).toStrictEqual({ User: { fields: {} } })
  })

  it('renames nothing until the field it became is named', () => {
    expect(
      makeDecisionModels([
        decision({ kind: 'column-dropped', field: 'name', choice: 'rename', value: '' }),
      ]),
    ).toStrictEqual({ User: { fields: {} } })
  })

  it('moves the rows of an enum member that has gone to the members that stay', () => {
    expect(
      makeDecisionModels([
        decision({
          kind: 'enum',
          modelName: 'Post',
          field: 'status',
          choice: 'map',
          value: 'DRAFT=PUBLISHED, OLD=NEW',
        }),
      ]),
    ).toStrictEqual({
      Post: { fields: { status: { values: { DRAFT: 'PUBLISHED', OLD: 'NEW' } } } },
    })
  })

  it('maps nothing when what was typed holds no pair, rather than mapping to nothing', () => {
    expect(
      makeDecisionModels([
        decision({ kind: 'enum', field: 'status', choice: 'map', value: 'DRAFT' }),
      ]),
    ).toStrictEqual({ User: { fields: {} } })
  })

  it('spans the fields of a unique key over more than one, which belongs to no one of them', () => {
    expect(
      makeDecisionModels([
        decision({ kind: 'unique', field: 'email, tenantId', choice: 'keep-last-delete' }),
      ]),
    ).toStrictEqual({
      User: { unique: [{ fields: ['email', 'tenantId'], keep: 'last', others: 'delete' }] },
    })
  })

  it('offers a choice for every check a decision answers', () => {
    const named = Object.entries(CHOICES).map(([kind, choices]) => {
      const made = makeDecisionModels([decision({ kind, choice: choices[0] ?? '', value: 'x' })])
      return { kind, choices: choices.length, models: Object.keys(made).join(',') }
    })
    // Every kind offers something (the type of CHOICES has no empty list), and every choice
    // lands on the model it is about; a dropped table has no model, and saying it may go fixes
    // nothing.
    expect(named.filter((one) => one.models !== 'User')).toStrictEqual([
      { kind: 'table-dropped', choices: 1, models: '' },
    ])
  })
})

describe('Decision', () => {
  it('reads a decision a check offers, a value left out as null', () => {
    const result = Decision.safeParse({
      kind: 'unique',
      modelName: 'User',
      field: 'email',
      choice: 'keep-first-delete',
    })
    expect(result.success && result.data).toStrictEqual({
      kind: 'unique',
      modelName: 'User',
      field: 'email',
      choice: 'keep-first-delete',
      value: null,
    })
  })

  it('refuses a kind there is no check of, a choice the check does not offer, and no model', () => {
    const issuesOf = (over: Partial<z.input<typeof Decision>>) => {
      const result = Decision.safeParse({
        kind: 'not-null',
        modelName: 'User',
        field: 'name',
        choice: 'value',
        ...over,
      })
      return result.success
        ? []
        : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    }
    expect(issuesOf({})).toStrictEqual([])
    expect(issuesOf({ kind: 'no-such-check' })).toStrictEqual([
      'kind: There is no check of this kind.',
    ])
    expect(issuesOf({ choice: 'clamp' })).toStrictEqual([
      'choice: The check does not offer this choice.',
    ])
    expect(issuesOf({ modelName: '' })).toHaveLength(1)
  })
})

describe('parseMapping', () => {
  it('reads the pairs however they were spaced, by comma or by line', () => {
    expect(parseMapping('DRAFT=PUBLISHED,OLD=NEW')).toStrictEqual({
      DRAFT: 'PUBLISHED',
      OLD: 'NEW',
    })
    expect(parseMapping('  DRAFT = PUBLISHED ,\n OLD =NEW ,')).toStrictEqual({
      DRAFT: 'PUBLISHED',
      OLD: 'NEW',
    })
  })

  it('reads a stored value with a comma, an equals sign or a quote in it from double quotes, and writes one back the same', () => {
    const pairs = [
      ['DRAFT', 'PUBLISHED'],
      ['in review, soon', 'REVIEW'],
      ['a=b', 'AB'],
      ['say "hi"', 'HI'],
    ] as const
    const written = formatMapping(pairs)
    expect(written).toBe('DRAFT=PUBLISHED, "in review, soon"=REVIEW, "a=b"=AB, "say ""hi"""=HI')
    expect(parseMapping(written)).toStrictEqual(Object.fromEntries(pairs))
  })

  it('leaves out what is not a pair, so half a line cannot map a value to nothing', () => {
    expect(parseMapping('DRAFT, OLD=NEW, =X, Y=')).toStrictEqual({ OLD: 'NEW' })
    expect(parseMapping('')).toStrictEqual({})
  })
})
