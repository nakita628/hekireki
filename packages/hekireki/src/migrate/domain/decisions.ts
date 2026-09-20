import * as z from 'zod'

import type { SeedValue } from '../../seed/config.js'

/** The choices each check offers, in the order a page would list them. */
export const CHOICES = {
  'not-null': ['value', 'sql'],
  'column-added': ['value', 'sql'],
  unique: ['keep-first-delete', 'keep-last-delete', 'keep-first-null', 'keep-last-null'],
  'foreign-key': ['null', 'delete'],
  'value-out-of-range': ['clamp', 'null', 'delete', 'value', 'sql'],
  'value-too-long': ['truncate', 'null', 'delete', 'value', 'sql'],
  'value-not-convertible': ['null', 'delete', 'value', 'sql'],
  'value-rounded': ['null', 'delete', 'value', 'sql'],
  'value-truncated': ['truncate', 'null', 'delete', 'value', 'sql'],
  'column-type': ['sql'],
  // PostgreSQL has no cast for the change and would drop the column: SQL says how each value converts.
  'column-recreated': ['sql', 'drop'],
  // The two that keep values a migration would otherwise take with it: a column Prisma reads as
  // dropped because the field it became has another name, and the rows of an enum member that
  // has gone. Neither is a count to bring to zero — they are a question about where data goes.
  // A column moved to a related model reads as dropped from one table and added to another.
  'column-dropped': ['rename', 'move', 'drop'],
  // A table the schema drops: there is no fix, but losing its rows is said out loud before it runs.
  'table-dropped': ['drop'],
  enum: ['map'],
} as const satisfies Readonly<Record<string, readonly string[]>>

function isKind(kind: string): kind is keyof typeof CHOICES {
  return Object.hasOwn(CHOICES, kind)
}

/**
 * A decision made on the Migrate page of `hekireki studio`: which check it answers, what it is
 * about, and what to do. Studio keeps them in `.hekireki/migrate.json` beside the schema, and
 * `hekireki migrate check` and `plan` read the same file, so the plan is the same everywhere.
 *
 * The brand says a decision has been read through this schema: its kind is a check there is, and
 * its choice one that check offers. What a person typed into a file never reaches a fix unread.
 */
export const Decision = z
  .object({
    kind: z
      .string()
      // Aborts: the choices are looked up by the kind, so there is nothing to look them up by.
      .refine(isKind, { error: 'There is no check of this kind.', abort: true })
      .meta({ description: 'The check it answers.', example: 'not-null' }),
    modelName: z.string().min(1).meta({ description: 'The model.', example: 'User' }),
    field: z
      .string()
      .meta({ description: 'The field, or the relation for a foreign key.', example: 'name' }),
    choice: z
      .string()
      .meta({ description: 'What to do, from the choices the check offers.', example: 'value' }),
    value: z.string().nullable().default(null).meta({
      description:
        'What a choice needs: the value or SQL written, the field a rename became, the `STORED=MEMBER` pairs of an enum, or the field duplicates are ordered by (the primary key when null).',
      example: 'unknown',
    }),
  })
  .refine(
    (decision) => {
      const offered: readonly string[] = CHOICES[decision.kind]
      return offered.includes(decision.choice)
    },
    { path: ['choice'], error: 'The check does not offer this choice.' },
  )
  .readonly()
  .brand<'Decision'>()
  .meta({ description: 'A decision made on the Migrate page of hekireki studio' })

export const Decisions = z
  .array(Decision)
  .readonly()
  .meta({ description: 'The decisions, in the order they were made.' })

/**
 * The members a decision moves rows to, written `STORED=MEMBER` a pair at a time. The page asks
 * for one line, and this is the line as the record the fix reads. A stored value with a comma, an
 * equals sign or a quote in it is written in double quotes, a quote in it doubled, as CSV does.
 *
 * @example
 * ```ts
 * parseMapping('DRAFT=PUBLISHED, OLD = NEW')   // { DRAFT: 'PUBLISHED', OLD: 'NEW' }
 * parseMapping('"in review, soon"=REVIEW')     // { 'in review, soon': 'REVIEW' }
 * parseMapping('DRAFT, OLD=NEW, =X, Y=')       // { OLD: 'NEW' }: what is not a pair is left out
 * ```
 *
 * @param written - the pairs as they were typed
 * @returns each stored value and the member it becomes, dropping anything that is not a pair
 */
export function parseMapping(written: string) {
  // A pair ends at a comma or a line end that is not inside quotes.
  const pairs = written.match(/(?:"(?:[^"]|"")*"|[^,\n])+/gu) ?? []
  return Object.fromEntries(
    pairs.flatMap((pair) => {
      const groups =
        /^\s*(?:"(?<quoted>(?:[^"]|"")*)"|(?<bare>[^="]*?))\s*=\s*(?<member>.*?)\s*$/u.exec(
          pair,
        )?.groups
      const stored = groups?.quoted?.replaceAll('""', '"') ?? groups?.bare ?? ''
      const member = groups?.member ?? ''
      return stored === '' || member === '' ? [] : [[stored, member] as const]
    }),
  )
}

/**
 * The pairs as `parseMapping` reads them back: what the page is offered as a suggestion.
 *
 * @example
 * ```ts
 * formatMapping([['DRAFT', 'PUBLISHED'], ['in review, soon', 'REVIEW']])
 * // 'DRAFT=PUBLISHED, "in review, soon"=REVIEW'
 * ```
 */
export function formatMapping(pairs: readonly (readonly [stored: string, member: string])[]) {
  return pairs
    .map(([stored, member]) =>
      /[,="\n]|^\s|\s$/u.test(stored)
        ? `"${stored.replaceAll('"', '""')}"=${member}`
        : `${stored}=${member}`,
    )
    .join(', ')
}

type FixValue = SeedValue | { readonly sql: string }

type DuplicatesFix = {
  readonly keep: 'first' | 'last'
  /** The field the rows are ordered by; the primary key when left out, and it breaks ties. */
  readonly orderBy?: string
  readonly others: 'delete' | 'null'
}

/**
 * The fixes of one model, as the check and the plan read them: per field, per relation, and per
 * unique key over more than one field. The decisions of the Migrate page are made into this.
 */
export type ModelFixes = {
  readonly fields?: Readonly<
    Record<
      string,
      {
        /** The column's name in the database now: the migration renames it, keeping its values. */
        readonly renamedFrom?: string
        /**
         * A column of a related model this field takes the values of: dropped from that table
         * and added to this one, each row given the value of the row it is related to.
         */
        readonly movedFrom?: { readonly model: string; readonly column: string }
        /** How each value becomes the new type, as SQL on the row as it is now. */
        readonly convert?: { readonly sql: string }
        readonly nulls?: FixValue
        /** The values stored now, and the member each becomes. */
        readonly values?: Readonly<Record<string, string>>
        readonly invalid?: 'null' | 'delete' | 'clamp' | 'truncate' | { readonly set: FixValue }
        readonly duplicates?: DuplicatesFix
      }
    >
  >
  readonly relations?: Readonly<Record<string, { readonly orphans?: 'null' | 'delete' }>>
  readonly unique?: readonly ({ readonly fields: readonly string[] } & DuplicatesFix)[]
}

type FieldFixes = NonNullable<ModelFixes['fields']>[string]

/**
 * Where a decision's fix lands: the field it names, except a rename's (the field the column
 * became) and a move's (`Model.field` in another model).
 *
 * @param decision - one decision
 * @returns the model and field the fix is made on; an empty field when the decision names none
 */
export function fixTarget(decision: z.infer<typeof Decision>) {
  const value = decision.value ?? ''
  if (decision.kind === 'column-dropped' && decision.choice === 'move') {
    const [model = '', field = ''] = value.split('.').map((part) => part.trim())
    return { model, field }
  }
  if (decision.kind === 'column-dropped') return { model: decision.modelName, field: value }
  return { model: decision.modelName, field: decision.field }
}

/** A value the page wrote, or SQL, as a fix writes it. */
function fixValue(decision: z.infer<typeof Decision>): FixValue {
  const value = decision.value ?? ''
  return decision.choice === 'sql' ? { sql: value } : value
}

/** What a decision puts on the field: `nulls` fills, `invalid` says what becomes of a bad value. */
function fieldFix(decision: z.infer<typeof Decision>): FieldFixes | null {
  const value = decision.value ?? ''
  // A rename is the only decision about a field other than the one the check names: the check
  // reports the column going away, and the fix belongs to the field it becomes.
  if (decision.kind === 'column-dropped') {
    if (decision.choice === 'move') {
      return fixTarget(decision).field === ''
        ? null
        : { movedFrom: { model: decision.modelName, column: decision.field } }
    }
    return decision.choice === 'rename' && value !== '' ? { renamedFrom: decision.field } : null
  }
  if (decision.kind === 'enum') {
    const values = parseMapping(value)
    return Object.keys(values).length === 0 ? null : { values }
  }
  if (decision.kind === 'not-null' || decision.kind === 'column-added') {
    return { nulls: fixValue(decision) }
  }
  if (decision.kind === 'column-type' || decision.kind === 'column-recreated') {
    return decision.choice === 'sql' ? { convert: { sql: value } } : null
  }
  if (decision.kind === 'table-dropped') return null
  if (decision.kind === 'unique') {
    const [, keep = 'first', others = 'delete'] = decision.choice.split('-')
    // The value, when there is one, is the field the rows are ordered by to say which is first.
    return keep === 'first' || keep === 'last'
      ? {
          duplicates: {
            keep,
            ...(value.trim() === '' ? {} : { orderBy: value.trim() }),
            others: others === 'null' ? ('null' as const) : ('delete' as const),
          },
        }
      : null
  }
  // The rest say what becomes of a value the column can no longer hold.
  if (decision.choice === 'value' || decision.choice === 'sql') {
    return { invalid: { set: fixValue(decision) } }
  }
  return decision.choice === 'clamp' ||
    decision.choice === 'truncate' ||
    decision.choice === 'null' ||
    decision.choice === 'delete'
    ? { invalid: decision.choice }
    : null
}

/**
 * What a decision is about, as the check names what does not fit it: `User.name`, and for a rename
 * the field the column became, which is where its fix lands.
 *
 * @param decision - one decision
 * @returns the model and field the errors about it start with
 */
export function decisionSubject(decision: z.infer<typeof Decision>) {
  const target = fixTarget(decision)
  return `${target.model}.${target.field}`
}

/**
 * Whether a decision is about a unique key over more than one field, which belongs to no one of
 * them: the check names them all, and the fixes keep it in `unique`, spanning the fields.
 */
function composite(decision: z.infer<typeof Decision>) {
  return decision.kind === 'unique' && decision.field.includes(', ')
}

/** The records a model's decisions land in: one per field, one per relation, and the keys spanning fields. */
function modelFix(decisions: z.infer<typeof Decisions>): ModelFixes {
  const relations = decisions.filter((decision) => decision.kind === 'foreign-key')
  const composites = decisions.filter(composite)
  const fields = decisions.filter(
    (decision) => decision.kind !== 'foreign-key' && !composite(decision),
  )
  // A rename or a move belongs to the field the column became; every other fix to the field it names.
  const named = fields.flatMap((decision) => {
    const fix = fieldFix(decision)
    const name = fixTarget(decision).field
    return fix === null || name === '' ? [] : [{ name, fix }]
  })
  return {
    ...(fields.length === 0
      ? {}
      : {
          // One field can take several decisions (its NULLs filled and its bad values cleared),
          // so they are gathered onto it rather than the last one standing for all.
          fields: Object.fromEntries(
            [...new Set(named.map((one) => one.name))].map((name) => [
              name,
              named
                .filter((one) => one.name === name)
                .reduce<FieldFixes>((merged, one) => Object.assign(merged, one.fix), {}),
            ]),
          ),
        }),
    ...(composites.length === 0
      ? {}
      : {
          unique: composites.flatMap((decision) => {
            const fix = fieldFix(decision)
            return fix?.duplicates === undefined
              ? []
              : [{ fields: decision.field.split(', '), ...fix.duplicates }]
          }),
        }),
    ...(relations.length === 0
      ? {}
      : {
          relations: Object.fromEntries(
            relations.map(
              (decision) =>
                [
                  decision.field,
                  {
                    orphans: decision.choice === 'delete' ? ('delete' as const) : ('null' as const),
                  },
                ] as const,
            ),
          ),
        }),
  }
}

/**
 * The decisions of the Migrate page as the fixes the check counts and the plan writes.
 *
 * @param decisions - what was chosen on the page, one per check answered
 * @returns the fixes of each model, empty when nothing was chosen
 */
export function makeDecisionModels(decisions: z.infer<typeof Decisions>) {
  // A table the schema drops has no model to fix: saying it may go changes nothing that runs.
  const fixing = decisions.filter((decision) => decision.kind !== 'table-dropped')
  // A move is a fix of the model the column moves to.
  const models: Readonly<Record<string, ModelFixes>> = Object.fromEntries(
    [...new Set(fixing.map((decision) => fixTarget(decision).model))].map((modelName) => [
      modelName,
      modelFix(fixing.filter((decision) => fixTarget(decision).model === modelName)),
    ]),
  )
  return models
}
