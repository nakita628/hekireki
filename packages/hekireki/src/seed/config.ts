import type { Faker } from '@faker-js/faker'

/** What a `Json` field holds. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/** What a generated cell may hold before it is rendered for a dialect. */
export type SeedValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | Uint8Array
  | null
  | readonly SeedValue[]
  | { readonly [key: string]: SeedValue }

/** A generated row keyed by Prisma field name; enum members carry their Prisma name. */
export type SeedRow = Readonly<Record<string, SeedValue>>

/**
 * A field as `hekireki-seed` writes it into the schema module: enough of the DMMF for the config
 * to be typed against, nothing that would change when a comment or an attribute does.
 */
export type SeedFieldInfo = {
  readonly name: string
  readonly kind: 'scalar' | 'enum' | 'object' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  /** Whether the field fills itself when left out: `@default(...)` or `@updatedAt`. */
  readonly hasDefault: boolean
  /** The `@relation` name, on relation fields. */
  readonly relationName?: string
  /** The scalar fields the foreign key lives in, on the relation field that owns it. */
  readonly relationFromFields?: readonly string[]
}

export type SeedModelInfo = {
  readonly name: string
  readonly fields: readonly SeedFieldInfo[]
  /** Every way to name one row: `@id`, each `@unique`, `@@id`, each `@@unique`. */
  readonly uniques: readonly (readonly string[])[]
}

export type SeedEnumInfo = {
  readonly name: string
  readonly values: readonly string[]
}

/** The Prisma schema as `hekireki-seed` writes it: the type `defineConfig` checks the rules against. */
export type SeedSchema = {
  readonly models: readonly SeedModelInfo[]
  readonly enums: readonly SeedEnumInfo[]
}

/** Keeps every model, field and enum member name of the generated schema module as a literal type. */
export function defineSchema<const S extends SeedSchema>(schema: S) {
  return schema
}

type ModelNamed<S extends SeedSchema, M> = Extract<S['models'][number], { readonly name: M }>

type ColumnFields<Mo extends SeedModelInfo> = Extract<
  Mo['fields'][number],
  { readonly kind: 'scalar' | 'enum' }
>

type EnumValue<S extends SeedSchema, E> = Extract<
  S['enums'][number],
  { readonly name: E }
>['values'][number]

type Scalar<S extends SeedSchema, F extends SeedFieldInfo> = F['kind'] extends 'enum'
  ? EnumValue<S, F['type']>
  : F['type'] extends 'String'
    ? string
    : F['type'] extends 'Int' | 'Float'
      ? number
      : F['type'] extends 'BigInt'
        ? bigint | number
        : F['type'] extends 'Decimal'
          ? string | number
          : F['type'] extends 'Boolean'
            ? boolean
            : F['type'] extends 'DateTime'
              ? Date | string
              : F['type'] extends 'Json'
                ? JsonValue
                : F['type'] extends 'Bytes'
                  ? Uint8Array
                  : SeedValue

/** What a rule may put in the field: its scalar, a list of them for a list field, null when optional. */
export type FieldValue<S extends SeedSchema, F extends SeedFieldInfo> =
  | (F['isList'] extends true ? readonly Scalar<S, F>[] : Scalar<S, F>)
  | (F['isRequired'] extends true ? never : null)

type LengthRule = { readonly length?: number | { readonly min: number; readonly max: number } }

type Bounds<F extends SeedFieldInfo> = (F['isList'] extends true
  ? { readonly min?: number; readonly max?: number } & LengthRule
  : F['type'] extends 'Int' | 'Float' | 'BigInt' | 'Decimal'
    ? { readonly min?: number; readonly max?: number }
    : F['type'] extends 'DateTime'
      ? { readonly from?: Date | string; readonly to?: Date | string }
      : F['type'] extends 'String'
        ? LengthRule
        : unknown) &
  (F['isRequired'] extends true ? unknown : { readonly nullRate?: number })

/** The fields of the row generated so far, as a rule function sees them. */
export type RowOf<S extends SeedSchema, Mo extends SeedModelInfo> = {
  readonly [F in ColumnFields<Mo> as F['name']]?: FieldValue<S, F>
}

type ObjectFields<Mo extends SeedModelInfo> = Extract<
  Mo['fields'][number],
  { readonly kind: 'object' }
>

/** A relation field that owns the foreign key (`author User @relation(fields: [authorId], ...)`). */
type OwningFields<Mo extends SeedModelInfo> = Extract<
  ObjectFields<Mo>,
  { readonly relationFromFields: readonly string[] }
>

/**
 * The other end of a relation field: the field of the related model with the same `@relation`
 * name. Under a self relation the field itself qualifies and is left out.
 */
type InverseOf<
  S extends SeedSchema,
  Mo extends SeedModelInfo,
  F extends SeedFieldInfo,
> = F['type'] extends Mo['name']
  ? Exclude<InverseCandidates<S, Mo, F>, { readonly name: F['name'] }>
  : InverseCandidates<S, Mo, F>

type InverseCandidates<
  S extends SeedSchema,
  Mo extends SeedModelInfo,
  F extends SeedFieldInfo,
> = Extract<
  ModelNamed<S, F['type']>['fields'][number],
  { readonly kind: 'object'; readonly type: Mo['name']; readonly relationName: F['relationName'] }
>

/** For each unique key set, an object of exactly those fields; mapped over the tuple so each set stays apart. */
type KeyUnion<
  S extends SeedSchema,
  Mo extends SeedModelInfo,
  U extends readonly (readonly string[])[],
> = {
  [I in keyof U]: U[I] extends readonly string[]
    ? {
        readonly [
          F in Extract<ColumnFields<Mo>, { readonly name: U[I][number] }> as F['name']
        ]: FieldValue<S, F>
      }
    : never
}[number]

/** One row of the model named by one of its unique keys: `{ email: '...' }` or `{ id: 1 }`. */
export type KeyOf<S extends SeedSchema, Mo extends SeedModelInfo> = KeyUnion<S, Mo, Mo['uniques']>

/** A relation field that does not own the key: the parent side of a one-to-many, or of a one-to-one. */
type ParentSideFields<S extends SeedSchema, Mo extends SeedModelInfo> = {
  [F in Exclude<ObjectFields<Mo>, OwningFields<Mo>> as F['name']]: InverseOf<S, Mo, F> extends {
    readonly relationFromFields: readonly string[]
  }
    ? F['name']
    : never
}[Exclude<ObjectFields<Mo>, OwningFields<Mo>>['name']]

/** The scalars that hold a foreign key: given as such, by a unique key on the relation, by nesting, or picked. */
type KeyScalars<Mo extends SeedModelInfo> = OwningFields<Mo>['relationFromFields'][number]

/** The columns a real row must carry: required, no default, not a list, not a key, not filled by nesting. */
type RequiredColumns<Mo extends SeedModelInfo, Filled extends string> = Exclude<
  Extract<
    ColumnFields<Mo>,
    { readonly isRequired: true; readonly hasDefault: false; readonly isList: false }
  >,
  { readonly name: Filled | KeyScalars<Mo> }
>

/** What a nested child row may leave out: the scalars of the key that points back at its parent. */
type FilledBy<S extends SeedSchema, Mo extends SeedModelInfo, F extends SeedFieldInfo> =
  InverseOf<S, Mo, F> extends { readonly relationFromFields: readonly (infer K extends string)[] }
    ? K
    : never

/**
 * A real row as the config gives it. Required fields without a default have to be there; any
 * other column may be; a field left out takes its `@default`, or null when optional. Relations
 * need no ids: a parent-side field nests the child rows (`posts: [{ title }]`, `profile: {
 * bio }`), a key-owning field names its parent by a unique key (`author: { email }`) or is left
 * out to be linked to a row that exists, and an implicit many-to-many lists ids or keys of the
 * other side (`tags: [{ label: 'prisma' }]`).
 */
export type DataRow<
  S extends SeedSchema,
  Mo extends SeedModelInfo,
  Filled extends string = never,
> = {
  readonly [F in RequiredColumns<Mo, Filled> as F['name']]: FieldValue<S, F>
} & {
  readonly [F in Exclude<ColumnFields<Mo>, RequiredColumns<Mo, Filled>> as F['name']]?: FieldValue<
    S,
    F
  >
} & {
  readonly [F in OwningFields<Mo> as F['name']]?: KeyOf<S, ModelNamed<S, F['type']>>
} & {
  readonly [
    F in Exclude<ObjectFields<Mo>, OwningFields<Mo>> as Extract<F['name'], ParentSideFields<S, Mo>>
  ]?: F['isList'] extends true
    ? readonly DataRow<S, ModelNamed<S, F['type']>, FilledBy<S, Mo, F>>[]
    : DataRow<S, ModelNamed<S, F['type']>, FilledBy<S, Mo, F>>
} & LinkFields<S, Mo>

/** The model names of a schema module, for `Row`, `Data` and `defineData`. */
export type ModelName<S extends SeedSchema> = S['models'][number]['name']

/**
 * One real row of the named model, for a row kept in its own variable: `const ann: Row<typeof
 * schema, 'User'> = { ... }`. `Filled` names the key scalars a parent fills when the row is nested
 * (`Row<typeof schema, 'Post', 'authorId'>` for a post that goes under a user).
 */
export type Row<
  S extends SeedSchema,
  M extends ModelName<S>,
  Filled extends string = never,
> = DataRow<S, ModelNamed<S, M>, Filled>

/** The real rows of the named model, for `data` kept in its own variable or file. */
export type Data<
  S extends SeedSchema,
  M extends ModelName<S>,
  Filled extends string = never,
> = readonly Row<S, M, Filled>[]

/**
 * Types real rows of one model outside `defineConfig`, so `data` can live in its own variable or
 * file: `export const users = defineData(schema, 'User', [{ email: '...', name: '...' }])`. The
 * rows are returned as they are; the check is the same one `defineConfig` makes.
 */
export function defineData<const S extends SeedSchema, M extends ModelName<S>>(
  schema: S,
  model: M,
  rows: NoInfer<Data<S, M>>,
) {
  return rows
}

/**
 * How one field is filled: a function of the seeded faker and the row so far, or bounds that fit
 * the field's type. `value` fixes it, `values` draws from a list (enum members by Prisma name).
 */
export type FieldRule<S extends SeedSchema, Mo extends SeedModelInfo, F extends SeedFieldInfo> =
  | ((
      faker: Faker,
      context: { readonly index: number; readonly row: RowOf<S, Mo> },
    ) => FieldValue<S, F>)
  | ({
      readonly value?: FieldValue<S, F>
      readonly values?: readonly FieldValue<S, F>[]
    } & Bounds<F>)

/**
 * How many related rows each row must have: partners of an implicit many-to-many, children of a
 * one-to-many, or the one child of a one-to-one (`min: 1` makes it required). Real rows are checked
 * against it; faker rows are dealt out to satisfy it.
 */
export type RelationRule = {
  readonly min?: number
  readonly max?: number
}

type ListRelations<Mo extends SeedModelInfo> = Extract<
  Mo['fields'][number],
  { readonly kind: 'object'; readonly isList: true }
>

/** The names of the list fields whose other side is a list too: Prisma keeps those pairs in a join table of its own. */
type ImplicitListNames<S extends SeedSchema, Mo extends SeedModelInfo> = {
  [F in ListRelations<Mo> as F['name']]: [
    Extract<InverseOf<S, Mo, F>, { readonly isList: true }>,
  ] extends [never]
    ? never
    : F['name']
}[ListRelations<Mo>['name']]

/** The relation fields a rule may bound: implicit many-to-many lists and the parent side of a key. */
type BoundedRelationNames<S extends SeedSchema, Mo extends SeedModelInfo> =
  | Extract<ImplicitListNames<S, Mo>, string>
  | Extract<ParentSideFields<S, Mo>, string>

type RelationRules<S extends SeedSchema, Mo extends SeedModelInfo> = [
  BoundedRelationNames<S, Mo>,
] extends [never]
  ? never
  : { readonly [K in BoundedRelationNames<S, Mo>]?: RelationRule }

/** In a real row, an implicit many-to-many field lists the rows of the other side, by id or by a unique key. */
type LinkFields<S extends SeedSchema, Mo extends SeedModelInfo> = {
  readonly [F in ListRelations<Mo> as Extract<F['name'], ImplicitListNames<S, Mo>>]?: readonly (
    | string
    | number
    | bigint
    | KeyOf<S, ModelNamed<S, F['type']>>
  )[]
}

type FieldRules<S extends SeedSchema, Mo extends SeedModelInfo> = {
  readonly [F in ColumnFields<Mo> as F['name']]?: FieldRule<S, Mo, F>
}

/**
 * One model is seeded from real rows or from faker, never both: `data` names the rows to insert
 * as written, `count` and `fields` shape the rows faker makes.
 */
export type ModelRule<S extends SeedSchema, Mo extends SeedModelInfo> =
  | {
      /** Real rows, inserted as written; a field left out takes its default, relations need no ids. */
      readonly data: readonly DataRow<S, Mo>[]
      readonly count?: never
      readonly fields?: never
      /** How many related rows each real row must have, per relation field. */
      readonly relations?: RelationRules<S, Mo>
    }
  | {
      readonly data?: never
      /** Rows to generate for the model. */
      readonly count?: number
      /** Rules per scalar or enum field. */
      readonly fields?: FieldRules<S, Mo>
      /** How many related rows each faker row gets, per relation field (`tags`, `posts`, `profile`). */
      readonly relations?: RelationRules<S, Mo>
    }

export type CommonOptions = {
  /** Path to schema.prisma or a directory of .prisma files; prisma/schema.prisma, then schema.prisma when omitted. */
  readonly schema?: string
  /** The faker seed: the same seed yields the same rows. Left out, every run differs. */
  readonly seed?: number
  /** The faker locale, or a list tried in order (`['ja', 'en']`). Left out, faker's English. */
  readonly locale?: string | readonly string[]
  /** Rows for every model that has no rule of its own. Left out, only the models in `models` are seeded. */
  readonly count?: number
  /** How often an optional field is null, from 0 to 1. Left out, optional fields are filled. */
  readonly nullRate?: number
  /** The window every DateTime falls in. Left out, faker's: the year before the run. */
  readonly dates?: { readonly from?: string | Date; readonly to?: string | Date }
  /** Where to write the SQL instead of inserting into the database. */
  readonly output?: string
  /** The database URL; DATABASE_URL from the environment or .env when omitted. */
  readonly url?: string
  /** Delete every row of the seeded tables before inserting. */
  readonly reset?: boolean
  /**
   * The project's Prisma Client, when the rows should go through it: `() => new PrismaClient({
   * adapter })`. Every write then runs in one `$transaction`; without it, `hekireki seed` connects
   * to the database URL itself.
   */
  readonly client?: () => unknown
}

/** The config checked against a schema module: only its models, fields and enum members are accepted. */
export type TypedSeedConfig<S extends SeedSchema> = CommonOptions & {
  readonly models?: { readonly [Mo in S['models'][number] as Mo['name']]?: ModelRule<S, Mo> }
}

/** A rule as the seeder reads it once the config is loaded, with no schema to check names against. */
export type LooseFieldRule =
  | ((faker: Faker, context: { readonly index: number; readonly row: SeedRow }) => SeedValue)
  | ({
      readonly value?: SeedValue
      readonly values?: readonly SeedValue[]
      readonly min?: number
      readonly max?: number
      readonly from?: Date | string
      readonly to?: Date | string
      readonly nullRate?: number
    } & LengthRule)

export type LooseModelRule = {
  readonly count?: number
  readonly data?: readonly SeedRow[]
  readonly fields?: Readonly<Record<string, LooseFieldRule>>
  readonly relations?: Readonly<Record<string, RelationRule>>
}

/** The config as `hekireki seed` reads it, whether it was written against a schema module or not. */
export type SeedConfig = CommonOptions & {
  readonly models?: Readonly<Record<string, LooseModelRule>>
}

/**
 * Types the seed config for `hekireki.config.ts`.
 *
 * With the schema module `hekireki-seed` generated, every model name, field name, enum member
 * and bound is checked against the Prisma schema and rule functions know the row they see.
 * Without one, any model and field name is accepted.
 */
export function defineConfig<const S extends SeedSchema>(
  schema: S,
  config: NoInfer<TypedSeedConfig<S>>,
): SeedConfig
export function defineConfig(config: SeedConfig): SeedConfig
export function defineConfig(
  ...args: readonly [schema: SeedSchema, config: object] | readonly [config: SeedConfig]
): SeedConfig {
  // The schema module is a type-level witness; the rows are made from schema.prisma itself.
  return args.length === 1 ? args[0] : { ...args[1] }
}
