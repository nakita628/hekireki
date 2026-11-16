// The English inflector of ActiveSupport 8.1 (active_support/inflections.rb and
// inflector/methods.rb), with no acronyms or rules of an application's own: what Active Record
// infers a class, a table, a foreign key and an inverse from. Rails prepends each rule it is given,
// so the last defined is tried first; the first that matches is the only one applied.

// cspell:disable -- the rules match word stems, not words.
// `irregular` adds the four rules of a pair whose words start alike, as all of Rails' own do.
const IRREGULARS = [
  ['person', 'people'],
  ['man', 'men'],
  ['child', 'children'],
  ['sex', 'sexes'],
  ['move', 'moves'],
  ['zombie', 'zombies'],
]

const PLURAL_RULES = [
  ['$', 's'],
  ['s$', 's'],
  ['^(ax|test)is$', '$1es'],
  ['(octop|vir)us$', '$1i'],
  ['(octop|vir)i$', '$1i'],
  ['(alias|status)$', '$1es'],
  ['(bu)s$', '$1ses'],
  ['(buffal|tomat)o$', '$1oes'],
  ['([ti])um$', '$1a'],
  ['([ti])a$', '$1a'],
  ['sis$', 'ses'],
  ['(?:([^f])fe|([lr])f)$', '$1$2ves'],
  ['(hive)$', '$1s'],
  ['([^aeiouy]|qu)y$', '$1ies'],
  ['(x|ch|ss|sh)$', '$1es'],
  ['(matr|vert|ind)(?:ix|ex)$', '$1ices'],
  ['^(m|l)ouse$', '$1ice'],
  ['^(m|l)ice$', '$1ice'],
  ['^(ox)$', '$1en'],
  ['^(oxen)$', '$1'],
  ['(quiz)$', '$1zes'],
  ...IRREGULARS.flatMap(([singular = '', plural = '']) => [
    [`(${singular[0]})${singular.slice(1)}$`, `$1${plural.slice(1)}`],
    [`(${plural[0]})${plural.slice(1)}$`, `$1${plural.slice(1)}`],
  ]),
]
  .toReversed()
  .map(([pattern = '', replacement = '']) => ({ pattern: new RegExp(pattern, 'iu'), replacement }))

const SINGULAR_RULES = [
  ['s$', ''],
  ['(ss)$', '$1'],
  ['(n)ews$', '$1ews'],
  ['([ti])a$', '$1um'],
  ['((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)(sis|ses)$', '$1sis'],
  ['(^analy)(sis|ses)$', '$1sis'],
  ['([^f])ves$', '$1fe'],
  ['(hive)s$', '$1'],
  ['(tive)s$', '$1'],
  ['([lr])ves$', '$1f'],
  ['([^aeiouy]|qu)ies$', '$1y'],
  ['(s)eries$', '$1eries'],
  ['(m)ovies$', '$1ovie'],
  ['(x|ch|ss|sh)es$', '$1'],
  ['^(m|l)ice$', '$1ouse'],
  ['(bus)(es)?$', '$1'],
  ['(o)es$', '$1'],
  ['(shoe)s$', '$1'],
  ['(cris|test)(is|es)$', '$1is'],
  ['^(a)x[ie]s$', '$1xis'],
  ['(octop|vir)(us|i)$', '$1us'],
  ['(alias|status)(es)?$', '$1'],
  ['^(ox)en', '$1'],
  ['(vert|ind)ices$', '$1ex'],
  ['(matr)ices$', '$1ix'],
  ['(quiz)zes$', '$1'],
  ['(database)s$', '$1'],
  ...IRREGULARS.flatMap(([singular = '', plural = '']) => [
    [`(${singular[0]})${singular.slice(1)}$`, `$1${singular.slice(1)}`],
    [`(${plural[0]})${plural.slice(1)}$`, `$1${singular.slice(1)}`],
  ]),
]
  .toReversed()
  .map(([pattern = '', replacement = '']) => ({ pattern: new RegExp(pattern, 'iu'), replacement }))

// A word ending in one of these, after a word boundary (so `event_equipment`, one word to the
// regex, is counted), is left as it is.
const UNCOUNTABLE =
  /\b(?:equipment|information|rice|money|species|series|fish|sheep|jeans|police)$/iu
// cspell:enable

function applyInflections(
  word: string,
  rules: readonly { readonly pattern: RegExp; readonly replacement: string }[],
) {
  if (word === '' || UNCOUNTABLE.test(word)) return word
  const rule = rules.find((candidate) => candidate.pattern.test(word))
  return rule === undefined ? word : word.replace(rule.pattern, rule.replacement)
}

/**
 * ActiveSupport's `pluralize`: the table Rails infers for a class is its `underscore`d name
 * pluralized (`event_data` stays `event_data`, `person` is `people`).
 *
 * @param word - A singular word.
 * @returns The plural Rails gives.
 */
export function pluralize(word: string) {
  return applyInflections(word, PLURAL_RULES)
}

/**
 * ActiveSupport's `singularize`: a collection association's class is its name singularized and
 * camelized (`event_data` is `event_datum`, `site_settings` is `site_setting`).
 *
 * @param word - A plural word.
 * @returns The singular Rails gives.
 */
export function singularize(word: string) {
  return applyInflections(word, SINGULAR_RULES)
}

// Ruby's String#capitalize: the first character in upper case, the rest in lower case.
function capitalize(word: string) {
  return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
}

/**
 * ActiveSupport's `camelize`: each word after an underscore is capitalised, which lowers the rest
 * of it (`api_key` is `ApiKey`, `user_ID` is `UserId`), and a slash is a namespace.
 *
 * @param term - An underscored name.
 * @returns The class name Rails gives.
 */
export function camelize(term: string) {
  return term
    .replace(/^[a-z\d]*/u, capitalize)
    .replaceAll(
      /(?:_|(\/))([a-z\d]*)/giu,
      (_match, slash: string | undefined, word: string) =>
        `${slash === undefined ? '' : '::'}${capitalize(word)}`,
    )
}

/**
 * ActiveSupport's `underscore`: a capital starts a word after a lower-case letter or a digit, or
 * before a lower-case letter after a capital (`HTTPLog` is `http_log`), and a namespace is a slash.
 *
 * @param word - A class name.
 * @returns The underscored name Rails gives.
 */
export function underscore(word: string) {
  if (!/[A-Z-]|::/u.test(word)) return word
  return word
    .replaceAll('::', '/')
    .replaceAll(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z\d])(?=[A-Z])/gu, '_')
    .replaceAll('-', '_')
    .toLowerCase()
}
