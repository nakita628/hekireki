import type { Faker } from '@faker-js/faker'
import { init as initCuid2 } from '@paralleldrive/cuid2'
import type { DMMF } from '@prisma/generator-helper'
import cuid from 'cuid'
import { customRandom, urlAlphabet } from 'nanoid'
import { ulid } from 'ulidx'
import { v4 as uuidV4, v7 as uuidV7 } from 'uuid'

import type { LooseFieldRule, SeedRow } from './config.js'
import type { EnumMember } from './plan.js'
import { fieldDefault } from './plan.js'

/** What the config says for every field: a null rate and a date window, or nothing. */
export type Bounds = {
  readonly nullRate: number | null
  readonly dates: { readonly from: Date; readonly to: Date } | null
}

const YEAR = 365 * 24 * 60 * 60 * 1000

type ObjectRule = Exclude<LooseFieldRule, (...args: never[]) => unknown>

function ruleObject(rule: LooseFieldRule | undefined): ObjectRule {
  return rule === undefined || typeof rule === 'function' ? {} : rule
}

function normalizedName(name: string) {
  return name.toLowerCase().replaceAll(/[_-]/gu, '')
}

/** The `@db.*` attribute of a field as name and numeric arguments (`@db.VarChar(64)` → VarChar, [64]). */
export function nativeTypeOf(field: DMMF.Field) {
  const [name, args] = field.nativeType ?? [null, []]
  return { name, args: args.map(Number) }
}

/**
 * A date in the field's window, the config's window, or, with neither, faker's own: the year
 * before the run. A window with one edge is a year long.
 */
export function dateBetween(faker: Faker, rule: ObjectRule, bounds: Bounds) {
  const to =
    rule.to === undefined
      ? (bounds.dates?.to ?? new Date(faker.defaultRefDate()))
      : new Date(rule.to)
  const from =
    rule.from === undefined
      ? (bounds.dates?.from ?? new Date(to.getTime() - YEAR))
      : new Date(rule.from)
  return faker.date.between(from <= to ? { from, to } : { from: to, to: from })
}

/** Bytes drawn from the seeded faker, for the id libraries that take their randomness from outside. */
function randomBytes(faker: Faker, size: number) {
  return Uint8Array.from({ length: size }, () => faker.number.int({ min: 0, max: 255 }))
}

/** A number in [0, 1) from the seeded faker, the shape cuid2 and ulidx expect of a PRNG. */
function randomFraction(faker: Faker) {
  return faker.number.int({ min: 0, max: 999_999 }) / 1_000_000
}

/**
 * The value a `@default(uuid())`-style attribute would produce, made by the same libraries Prisma
 * clients use (uuid, cuid2, cuid, nanoid, ulidx), with their randomness drawn from the seeded
 * faker so the ids come out the same for the same seed. cuid and cuid2 stamp the clock in and
 * so differ from run to run.
 */
export function generatedDefault(
  faker: Faker,
  field: DMMF.Field,
  rule: ObjectRule,
  bounds: Bounds,
) {
  const generated = fieldDefault(field)
  if (generated === null) return null
  const argument = String(generated.args[0] ?? '')
  switch (generated.name) {
    case 'uuid':
      return argument === '7'
        ? uuidV7({
            msecs: dateBetween(faker, rule, bounds).getTime(),
            random: randomBytes(faker, 16),
          })
        : uuidV4({ random: randomBytes(faker, 16) })
    case 'cuid':
      return argument === '2'
        ? initCuid2({
            random: () => randomFraction(faker),
            length: 24,
            fingerprint: faker.string.alphanumeric(32),
          })()
        : cuid()
    case 'nanoid': {
      const length = Number(argument)
      const size = Number.isInteger(length) && length > 0 ? length : 21
      return customRandom(urlAlphabet, size, (count) => randomBytes(faker, count))()
    }
    case 'ulid':
      return ulid(dateBetween(faker, rule, bounds).getTime(), () => randomFraction(faker))
    case 'now':
      return dateBetween(faker, rule, bounds)
    default:
      return null
  }
}

// The patterns match field names with their underscores removed and lower-cased (`postal_code`
// reads `postalcode`), which is why the tokens below are not words.
// cspell:ignore emailaddress postalcode couponcode promocode passwordhash colou organi ation currencycode
const TEXT_PATTERNS: readonly (readonly [RegExp, (faker: Faker) => string])[] = [
  [/^(e?mail|emailaddress)$/u, (faker) => faker.internet.email().toLowerCase()],
  [/^(full|display)?name$/u, (faker) => faker.person.fullName()],
  [/^(user|nick|screen)name$|^(handle|login)$/u, (faker) => faker.internet.username()],
  [/^(first|given)name$/u, (faker) => faker.person.firstName()],
  [/^(last|family|sur)name$/u, (faker) => faker.person.lastName()],
  [
    /^(title|subject|headline|heading)$/u,
    (faker) => faker.lorem.sentence({ min: 3, max: 6 }).replace(/\.$/u, ''),
  ],
  [
    /^(body|content|description|bio|text|message|comment|summary|notes?|about|excerpt)$/u,
    (faker) => faker.lorem.paragraph(),
  ],
  [/^(url|uri|website|link|homepage)$/u, (faker) => faker.internet.url()],
  [/^(avatar|image|img|thumbnail|photo|picture)(url)?$/u, (faker) => faker.image.avatar()],
  [/^(phone|tel|telephone|mobile)(number)?$/u, (faker) => faker.phone.number()],
  [/^(street)?address(line\d)?$|^street$/u, (faker) => faker.location.streetAddress()],
  [/^city$/u, (faker) => faker.location.city()],
  [/^country$/u, (faker) => faker.location.country()],
  [/^(state|prefecture|region|province)$/u, (faker) => faker.location.state()],
  [/^(zip|zipcode|postalcode|postcode)$/u, (faker) => faker.location.zipCode()],
  [/^slug$/u, (faker) => faker.lorem.slug()],
  [
    /^(sku|code|coupon|couponcode|promocode)$/u,
    (faker) => faker.string.alphanumeric({ length: 8, casing: 'upper' }),
  ],
  [/^(password|passwordhash|hash|digest)$/u, (faker) => faker.internet.password()],
  [/^(ip|ipaddress)$/u, (faker) => faker.internet.ip()],
  [/^colou?r$/u, (faker) => faker.color.human()],
  [/^(company|organi[sz]ation|vendor|employer)$/u, (faker) => faker.company.name()],
  [
    /^(label|tag|tagname|keyword|category|categoryname|genre|topic)$/u,
    (faker) => faker.lorem.word(),
  ],
  [/^(currency|currencycode)$/u, (faker) => faker.finance.currencyCode()],
  [/^(token|apikey|secret|signature|key)$/u, (faker) => faker.string.alphanumeric(32)],
  [/^(uuid|guid)$/u, (faker) => faker.string.uuid()],
]

function makeText(faker: Faker, name: string) {
  const match = TEXT_PATTERNS.find(([pattern]) => pattern.test(name))
  return match === undefined ? faker.lorem.words({ min: 1, max: 3 }) : match[1](faker)
}

function maxLength(field: DMMF.Field, rule: ObjectRule) {
  const native = nativeTypeOf(field)
  const declared =
    native.name !== null && /^(Var|N|NVar)?Char$/u.test(native.name) ? native.args[0] : undefined
  const ruled = typeof rule.length === 'number' ? rule.length : rule.length?.max
  const bounds = [declared, ruled].filter((n): n is number => n !== undefined && n > 0)
  return bounds.length === 0 ? null : Math.min(...bounds)
}

function makeString(faker: Faker, field: DMMF.Field, rule: ObjectRule) {
  const native = nativeTypeOf(field)
  const text =
    native.name === 'Uuid' ? faker.string.uuid() : makeText(faker, normalizedName(field.name))
  const limit = maxLength(field, rule)
  return limit === null ? text : text.slice(0, limit)
}

function intRange(field: DMMF.Field, rule: ObjectRule) {
  const name = normalizedName(field.name)
  const native = nativeTypeOf(field)
  const natural = /^age$/u.test(name)
    ? { min: 18, max: 90 }
    : /^year$/u.test(name)
      ? { min: 1970, max: 2030 }
      : /^(qty|quantity)$/u.test(name)
        ? { min: 1, max: 20 }
        : /^(rating|stars)$/u.test(name)
          ? { min: 1, max: 5 }
          : /^(price|amount|total|balance|salary|cost|fee)$/u.test(name)
            ? { min: 0, max: 100_000 }
            : native.name === 'TinyInt'
              ? { min: 0, max: 127 }
              : native.name === 'SmallInt'
                ? { min: 0, max: 32_767 }
                : { min: 0, max: 1000 }
  return { min: rule.min ?? natural.min, max: rule.max ?? natural.max }
}

function floatRange(field: DMMF.Field, rule: ObjectRule) {
  const name = normalizedName(field.name)
  const natural = /^(lat|latitude)$/u.test(name)
    ? { min: -90, max: 90 }
    : /^(lng|lon|long|longitude)$/u.test(name)
      ? { min: -180, max: 180 }
      : /^(price|amount|total|balance|salary|cost|fee)$/u.test(name)
        ? { min: 0, max: 10_000 }
        : { min: 0, max: 1000 }
  return { min: rule.min ?? natural.min, max: rule.max ?? natural.max }
}

function makeDecimal(faker: Faker, field: DMMF.Field, rule: ObjectRule) {
  const native = nativeTypeOf(field)
  const [precision, scale] =
    native.name !== null &&
    /^(Decimal|Numeric|Money)$/u.test(native.name) &&
    native.args.length === 2
      ? [native.args[0] ?? 10, native.args[1] ?? 2]
      : [10, 2]
  const range = floatRange(field, rule)
  const ceiling = 10 ** (precision - scale) - 1
  const value = faker.number.float({
    min: Math.max(range.min, -ceiling),
    max: Math.min(range.max, ceiling),
    fractionDigits: scale,
  })
  return value.toFixed(scale)
}

function makeDateTime(faker: Faker, field: DMMF.Field, rule: ObjectRule, bounds: Bounds) {
  const date = dateBetween(faker, rule, bounds)
  const native = nativeTypeOf(field)
  if (native.name === 'Date') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  }
  if (native.name === 'Time') {
    return new Date(
      Date.UTC(1970, 0, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()),
    )
  }
  return date
}

function makeJson(faker: Faker) {
  return {
    note: faker.lorem.sentence(),
    tags: faker.lorem.words({ min: 1, max: 3 }).split(' '),
    score: faker.number.int({ min: 0, max: 100 }),
  }
}

/** One scalar of the field's type, honouring its native type, name and the rule's bounds. */
function makeScalar(
  faker: Faker,
  field: DMMF.Field,
  enumValues: readonly EnumMember[] | null,
  rule: ObjectRule,
  bounds: Bounds,
  index: number,
) {
  if (field.kind === 'enum') {
    return enumValues === null || enumValues.length === 0
      ? null
      : faker.helpers.arrayElement(enumValues).name
  }
  switch (field.type) {
    case 'String':
      return makeString(faker, field, rule)
    case 'Int':
      return field.isId && rule.min === undefined && rule.max === undefined
        ? index + 1
        : faker.number.int(intRange(field, rule))
    case 'BigInt': {
      const range = intRange(field, rule)
      return field.isId && rule.min === undefined && rule.max === undefined
        ? BigInt(index + 1)
        : faker.number.bigInt({ min: range.min, max: range.max })
    }
    case 'Float':
      return faker.number.float({ ...floatRange(field, rule), fractionDigits: 2 })
    case 'Decimal':
      return makeDecimal(faker, field, rule)
    case 'Boolean':
      return faker.datatype.boolean()
    case 'DateTime':
      return makeDateTime(faker, field, rule, bounds)
    case 'Json':
      return makeJson(faker)
    case 'Bytes':
      return Uint8Array.from(
        Buffer.from(faker.string.hexadecimal({ length: 32, prefix: '', casing: 'lower' }), 'hex'),
      )
    default:
      return makeString(faker, field, rule)
  }
}

function listLength(faker: Faker, rule: ObjectRule) {
  const range =
    typeof rule.length === 'number'
      ? { min: rule.length, max: rule.length }
      : (rule.length ?? { min: rule.min ?? 0, max: rule.max ?? 3 })
  return faker.number.int({ min: range.min, max: Math.max(range.min, range.max) })
}

/**
 * The value of one field of one row. A rule function wins outright; a rule object narrows what
 * the field's type, native type and name would otherwise produce.
 */
export function makeFieldValue(input: {
  readonly faker: Faker
  readonly field: DMMF.Field
  readonly enumValues: readonly EnumMember[] | null
  readonly rule: LooseFieldRule | undefined
  readonly bounds: Bounds
  readonly index: number
  readonly row: SeedRow
}) {
  const { faker, field, enumValues, bounds, index, row } = input
  if (typeof input.rule === 'function') return input.rule(faker, { index, row })
  const rule = ruleObject(input.rule)
  if (rule.value !== undefined) return rule.value
  if (!field.isRequired && !field.isList) {
    const nullRate = rule.nullRate ?? bounds.nullRate ?? 0
    if (nullRate > 0 && faker.datatype.boolean({ probability: nullRate })) return null
  }
  const choices = rule.values !== undefined && rule.values.length > 0 ? rule.values : null
  if (choices !== null && !field.isList) return faker.helpers.arrayElement(choices)
  if (field.isList) {
    const length = listLength(faker, rule)
    if (choices !== null) return faker.helpers.arrayElements(choices, length)
    return Array.from({ length }, () =>
      makeScalar(
        faker,
        field,
        enumValues,
        { ...rule, min: undefined, max: undefined },
        bounds,
        index,
      ),
    )
  }
  const generated =
    fieldDefault(field)?.name === 'autoincrement'
      ? field.type === 'BigInt'
        ? BigInt(index + 1)
        : index + 1
      : generatedDefault(faker, field, rule, bounds)
  return generated ?? makeScalar(faker, field, enumValues, rule, bounds, index)
}
