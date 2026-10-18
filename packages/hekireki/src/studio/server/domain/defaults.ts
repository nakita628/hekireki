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
 */
export function makeGeneratedFields(input: z.infer<typeof MakeGeneratedFieldsInput>) {
  return input.model.fields.flatMap((field) => {
    if (field.kind === 'object' || field.kind === 'unsupported') return []
    if (field.name in input.row) return []
    const generated = /^(?<name>uuid|cuid|nanoid|ulid|now)\((?<argument>[^)]*)\)$/u.exec(
      field.default ?? '',
    )?.groups
    const argument = generated?.argument?.trim() ?? ''
    const length = Number(argument)
    const generator =
      generated?.name === 'uuid'
        ? ({ kind: 'uuid', version: argument === '7' ? 7 : 4 } as const)
        : generated?.name === 'cuid'
          ? ({ kind: 'cuid', version: argument === '2' ? 2 : 1 } as const)
          : generated?.name === 'nanoid'
            ? ({
                kind: 'nanoid',
                length: Number.isInteger(length) && length > 0 ? length : null,
              } as const)
            : generated?.name === 'ulid'
              ? ({ kind: 'ulid' } as const)
              : generated?.name === 'now' || field.isUpdatedAt
                ? ({ kind: 'now' } as const)
                : field.isList && field.isRequired && field.default === null
                  ? ({ kind: 'literal', value: '[]' } as const)
                  : null
    return generator === null ? [] : [{ name: field.name, generator }]
  })
}
