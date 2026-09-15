import * as z from 'zod'

const MakeClientTouchedInput = z
  .object({
    calls: z
      .array(
        z
          .object({
            model: z
              .string()
              .meta({ description: 'The model the call is made on.', example: 'User' }),
            args: z
              .unknown()
              .meta({ description: 'The literal arguments of the call, as the text spells them.' }),
          })
          .readonly()
          .meta({ description: 'One call of the query' }),
      )
      .readonly()
      .meta({ description: 'The calls of the query, in order.' }),
    models: z
      .array(
        z
          .object({
            name: z.string().meta({ description: 'The model name.', example: 'User' }),
            fields: z
              .array(
                z
                  .object({
                    name: z.string().meta({ description: 'The field name.', example: 'posts' }),
                    kind: z
                      .string()
                      .meta({ description: '"object" for a relation field.', example: 'object' }),
                    type: z
                      .string()
                      .meta({ description: 'The model a relation reaches.', example: 'Post' }),
                  })
                  .readonly()
                  .meta({ description: 'A field of the model' }),
              )
              .readonly()
              .meta({ description: 'The fields of the model.' }),
          })
          .readonly()
          .meta({ description: 'A model of the schema' }),
      )
      .readonly()
      .meta({ description: 'The models of the schema.' }),
  })
  .readonly()
  .meta({
    description: 'The calls of a Prisma Client query, read against the models of the schema',
    example: {
      calls: [{ model: 'User', args: { include: { posts: true } } }],
      models: [
        { name: 'User', fields: [{ name: 'posts', kind: 'object', type: 'Post' }] },
        { name: 'Post', fields: [] },
      ],
    },
  })

// The argument keys whose values are field names written as strings: `by: ['role']`, `distinct: 'email'`.
const FIELD_LISTS = new Set(['by', 'distinct'])

/**
 * The model and field pairs the value names, read as arguments of `model`; a model a relation
 * reaches comes with no field, so it is touched even when nothing of it is named.
 */
function namedIn(
  value: unknown,
  model: string,
  models: z.infer<typeof MakeClientTouchedInput>['models'],
): readonly (readonly [string, string | null])[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => namedIn(item, model, models))
  }
  // A date, like any other value that is not an object, names nothing.
  if (typeof value !== 'object' || value === null) return []
  const fields = models.find((entry) => entry.name === model)?.fields ?? []
  const entries = Object.entries(value).map(([key, inner]: [string, unknown]) => ({
    key,
    inner,
    field: fields.find((entry) => entry.name === key),
  }))
  // The fields named here: a key that is one, or one written as a string under `by` or `distinct`.
  const own = entries.flatMap(({ key, inner, field }) =>
    field !== undefined
      ? [key]
      : FIELD_LISTS.has(key)
        ? (Array.isArray(inner) ? inner : [inner]).filter(
            (name): name is string =>
              typeof name === 'string' && fields.some((entry) => entry.name === name),
          )
        : [],
  )
  // Under a relation, the arguments of the model it reaches; under an argument or an operator
  // (`where`, `select`, `AND`, `some`, `_count`), this model's again.
  const deeper = entries.flatMap(({ key, inner, field }) =>
    field === undefined
      ? FIELD_LISTS.has(key)
        ? []
        : namedIn(inner, model, models)
      : field.kind === 'object'
        ? namedIn(inner, field.type, models)
        : [],
  )
  const reached = entries.flatMap(({ field }) =>
    field?.kind === 'object' && models.some((entry) => entry.name === field.type)
      ? [[field.type, null] as const]
      : [],
  )
  return [...own.map((name) => [model, name] as const), ...reached, ...deeper]
}

/**
 * What the query touches: the model of each call, and every model a relation field of its
 * arguments reaches (`include: { posts: ... }`, `where: { author: { is: ... } }`), each with the
 * fields the arguments name — the scalars they filter, select, order or write, the relations they
 * follow. Nothing is run: it is read from the literal arguments.
 *
 * @param input - the calls with their arguments, and the models of the schema
 * @returns the models in the order the query reaches them, each with the fields it names
 */
export function makeClientTouched(input: z.infer<typeof MakeClientTouchedInput>) {
  const named = input.calls.flatMap((call) => namedIn(call.args, call.model, input.models))
  const models = new Set([
    ...input.calls.map((call) => call.model),
    ...named.map(([model]) => model),
  ])
  return [...models].map((model) => ({
    model,
    fields: [
      ...new Set(
        named.flatMap(([owner, field]) => (owner === model && field !== null ? [field] : [])),
      ),
    ],
  }))
}
