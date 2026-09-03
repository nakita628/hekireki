import { randomBytes, randomUUID } from 'node:crypto'

import * as z from 'zod'

// Prisma fills these defaults in the client, not in the database, so a row Studio inserts has
// to carry them; the database supplies autoincrement(), dbgenerated(), sequence() and literals.
const GENERATED_DEFAULT = /^(?<name>uuid|cuid|nanoid|ulid|now)\((?<argument>[^)]*)\)$/u

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz'
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const URL_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'

function randomText(alphabet: string, length: number) {
  const bytes = randomBytes(length)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

/** A UUID v7: 48 bits of Unix milliseconds, then random bits, so keys sort by creation time. */
export function makeUuidV7(now = Date.now()) {
  const bytes = randomBytes(16)
  // Bytes 0-5 hold the timestamp; byte 6 gets version 7 in its high nibble, byte 8 the RFC variant.
  const versioned = Uint8Array.from(bytes, (byte, index) =>
    index < 6
      ? Math.floor(now / 256 ** (5 - index)) % 256
      : index === 6
        ? 0x70 + (byte % 16)
        : index === 8
          ? 0x80 + (byte % 64)
          : byte,
  )
  const hex = Array.from(versioned, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** A cuid-shaped id: `c`, then a base36 timestamp and random text, 25 characters in all. */
export function makeCuid(now = Date.now()) {
  const timestamp = now.toString(36)
  return `c${timestamp}${randomText(BASE36, 24 - timestamp.length)}`
}

/** A cuid2-shaped id: a letter followed by 23 base36 characters. */
export function makeCuid2() {
  return `${BASE36.slice(10)[randomBytes(1)[0] % 26]}${randomText(BASE36, 23)}`
}

export function makeNanoid(length = 21) {
  return randomText(URL_ALPHABET, length)
}

/** A ULID: 10 characters of Crockford-base32 milliseconds, then 16 random characters. */
export function makeUlid(now = Date.now()) {
  const time = Array.from(
    { length: 10 },
    (_, index) => CROCKFORD[Math.floor(now / 32 ** (9 - index)) % 32],
  ).join('')
  return `${time}${randomText(CROCKFORD, 16)}`
}

const GeneratedDefaultsInput = z
  .object({
    model: z
      .custom<{
        readonly fields: readonly {
          readonly name: string
          readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
          readonly isList: boolean
          readonly isRequired: boolean
          readonly isUpdatedAt: boolean
          readonly default: string | null
        }[]
      }>()
      .meta({ description: 'The Prisma model of the row.' }),
    row: z
      .record(z.string(), z.unknown())
      .readonly()
      .meta({ description: 'The values the user gave, by field name.' }),
    now: z.number().optional().meta({
      description: 'The insert time in Unix milliseconds; the clock when omitted.',
      example: 1_788_000_000_000,
    }),
  })
  .readonly()
  .meta({ description: 'A model and the values given for a new row' })

function generate(name: string, argument: string, now: number) {
  switch (name) {
    case 'uuid':
      return argument.trim() === '7' ? makeUuidV7(now) : randomUUID()
    case 'cuid':
      return argument.trim() === '2' ? makeCuid2() : makeCuid(now)
    case 'nanoid': {
      const length = Number(argument)
      return makeNanoid(Number.isInteger(length) && length > 0 ? length : 21)
    }
    case 'ulid':
      return makeUlid(now)
    case 'now':
      return new Date(now).toISOString()
    default:
      return null
  }
}

/**
 * The values Prisma would generate for the fields the user left out: ids from `uuid()`, `cuid()`,
 * `nanoid()`, `ulid()`, timestamps from `now()` and `@updatedAt`, and an empty list for a
 * required list field.
 */
export function makeGeneratedDefaults(input: z.infer<typeof GeneratedDefaultsInput>) {
  const now = input.now ?? Date.now()
  return Object.fromEntries(
    input.model.fields.flatMap((field) => {
      if (field.kind === 'object' || field.kind === 'unsupported') return []
      if (field.name in input.row) return []
      const generated = GENERATED_DEFAULT.exec(field.default ?? '')?.groups
      if (generated?.name !== undefined) {
        const value = generate(generated.name, generated.argument ?? '', now)
        return value === null ? [] : [[field.name, value] as const]
      }
      if (field.isUpdatedAt) return [[field.name, new Date(now).toISOString()] as const]
      if (field.isList && field.isRequired && field.default === null) {
        return [[field.name, '[]'] as const]
      }
      return []
    }),
  )
}
