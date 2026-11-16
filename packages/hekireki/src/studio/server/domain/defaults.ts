import * as z from 'zod'

const MakeGeneratedFieldsInput = z
  .object({
    model: z
      .object({
        fields: z
          .array(
            z
              .object({
                name: z
                  .string()
                  .meta({ description: 'The Prisma field name.', example: 'createdAt' }),
                kind: z
                  .enum(['scalar', 'object', 'enum', 'unsupported'])
                  .meta({ description: 'What the field holds.', example: 'scalar' }),
                isList: z
                  .boolean()
                  .meta({ description: 'Whether the field is a list.', example: false }),
                isRequired: z
                  .boolean()
                  .meta({ description: 'Whether the field is required.', example: true }),
                isUpdatedAt: z
                  .boolean()
                  .meta({ description: 'Whether the field carries @updatedAt.', example: false }),
                default: z.string().nullable().meta({
                  description: 'The @default as it is written, when the field has one.',
                  example: 'uuid(7)',
                }),
              })
              .readonly(),
          )
          .readonly()
          .meta({ description: 'The fields of the model.' }),
      })
      .readonly()
      .meta({ description: 'The Prisma model of the row.' }),
    row: z
      .record(z.string(), z.unknown())
      .readonly()
      .meta({ description: 'The values the user gave, by field name.' }),
  })
  .readonly()
  .meta({ description: 'A model and the values given for a new row' })

/**
 * The fields the user left out that Prisma fills in the client, and what each one takes: an id
 * from `uuid()`, `cuid()`, `nanoid()` or `ulid()`, the time for `now()` and `@updatedAt`, and an
 * empty list for a required list field. The database supplies `autoincrement()`,
 * `dbgenerated()`, `sequence()` and literals on its own, so those are left to it. An id or a time
 * needs randomness and a clock, which the services hold: `generateDefaults` makes the values.
 *
 * @param input.model - the Prisma model of the row: each field's name, kind, list and required
 *   flags, `@updatedAt` and `@default` as written
 * @param input.row - the values the user gave, by field name
 * @returns each field left out that the client fills in, with the generator that makes its value
 * @example
 * makeGeneratedFields({
 *   model: {
 *     fields: [
 *       { name: 'id', kind: 'scalar', isList: false, isRequired: true, isUpdatedAt: false, default: 'uuid(7)' },
 *       { name: 'title', kind: 'scalar', isList: false, isRequired: true, isUpdatedAt: false, default: null },
 *     ],
 *   },
 *   row: { title: 'Hello' },
 * })
 * // [{ name: 'id', generator: { kind: 'uuid', version: 7 } }]
 */
export function makeGeneratedFields(input: z.infer<typeof MakeGeneratedFieldsInput>) {
  return input.model.fields.flatMap((field) => {
    if (field.kind === 'object' || field.kind === 'unsupported') return []
    if (field.name in input.row) return []
    const generator = generatorOf(field)
    return generator === null ? [] : [{ name: field.name, generator }]
  })
}

type DefaultedField = z.infer<typeof MakeGeneratedFieldsInput>['model']['fields'][number]

const GENERATED_DEFAULT = /^(?<name>uuid|cuid|nanoid|ulid|now)\((?<argument>[^)]*)\)$/u

// What the client fills a left-out field with: the function of its `@default(...)`, the time for
// `@updatedAt`, an empty list for a required list with no default, or null for nothing.
function generatorOf(field: DefaultedField) {
  const generated = GENERATED_DEFAULT.exec(field.default ?? '')?.groups
  if (generated !== undefined) {
    return generatorCalled(generated['name'] ?? '', generated['argument']?.trim() ?? '')
  }
  if (field.isUpdatedAt) return { kind: 'now' } as const
  if (field.isList && field.isRequired && field.default === null) {
    return { kind: 'literal', value: '[]' } as const
  }
  return null
}

// The generator of a `@default` function, by its name and its argument.
function generatorCalled(name: string, argument: string) {
  switch (name) {
    case 'uuid':
      return { kind: 'uuid', version: argument === '7' ? 7 : 4 } as const
    case 'cuid':
      return { kind: 'cuid', version: argument === '2' ? 2 : 1 } as const
    case 'nanoid': {
      const length = Number(argument)
      return {
        kind: 'nanoid',
        length: Number.isInteger(length) && length > 0 ? length : null,
      } as const
    }
    case 'ulid':
      return { kind: 'ulid' } as const
    // The pattern leaves `now()` alone.
    default:
      return { kind: 'now' } as const
  }
}
