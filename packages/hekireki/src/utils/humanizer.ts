// The English inflector of Humanizer 2.14.1 — the version `dotnet ef dbcontext scaffold` pluralizes
// DbSet names with (Microsoft.EntityFrameworkCore.Design depends on Humanizer.Core 2.14.1). Rules are
// tried last to first, as Humanizer's Vocabulary does, so later entries override earlier ones.

function irregular(singular: string, plural: string) {
  return {
    plural: [`(${singular[0]})${singular.slice(1)}$`, `$1${plural.slice(1)}`],
    singular: [`(${plural[0]})${plural.slice(1)}$`, `$1${singular.slice(1)}`],
  } as const
}

function wholeWordIrregular(singular: string, plural: string) {
  return { plural: [`^${singular}$`, plural], singular: [`^${plural}$`, singular] } as const
}

// cspell:disable -- Humanizer's rules match word stems, not words.
const IRREGULARS = [
  irregular('person', 'people'),
  irregular('man', 'men'),
  irregular('human', 'humans'),
  irregular('child', 'children'),
  irregular('sex', 'sexes'),
  irregular('glove', 'gloves'),
  irregular('move', 'moves'),
  irregular('goose', 'geese'),
  irregular('wave', 'waves'),
  irregular('foot', 'feet'),
  irregular('tooth', 'teeth'),
  irregular('curriculum', 'curricula'),
  irregular('database', 'databases'),
  irregular('zombie', 'zombies'),
  irregular('personnel', 'personnel'),
  irregular('cache', 'caches'),
  wholeWordIrregular('ex', 'exes'),
  wholeWordIrregular('is', 'are'),
  wholeWordIrregular('that', 'those'),
  wholeWordIrregular('this', 'these'),
  wholeWordIrregular('bus', 'buses'),
  wholeWordIrregular('die', 'dice'),
  wholeWordIrregular('tie', 'ties'),
]

const PLURAL_RULES = [
  ['$', 's'],
  ['s$', 's'],
  ['(ax|test)is$', '$1es'],
  ['(octop|vir|alumn|fung|cact|foc|hippopotam|radi|stimul|syllab|nucle)us$', '$1i'],
  ['(alias|bias|iris|status|campus|apparatus|virus|walrus|trellis)$', '$1es'],
  ['(buffal|tomat|volcan|ech|embarg|her|mosquit|potat|torped|vet)o$', '$1oes'],
  ['([dti])um$', '$1a'],
  ['sis$', 'ses'],
  ['(?:([^f])fe|([lr])f)$', '$1$2ves'],
  ['(hive)$', '$1s'],
  ['([^aeiouy]|qu)y$', '$1ies'],
  ['(x|ch|ss|sh)$', '$1es'],
  ['(matr|vert|ind|d)(ix|ex)$', '$1ices'],
  ['(^[m|l])ouse$', '$1ice'],
  ['^(ox)$', '$1en'],
  ['(quiz)$', '$1zes'],
  ['(buz|blit|walt)z$', '$1zes'],
  ['(hoo|lea|loa|thie)f$', '$1ves'],
  ['(alumn|alg|larv|vertebr)a$', '$1ae'],
  ['(criteri|phenomen)on$', '$1a'],
  ...IRREGULARS.map((rule) => rule.plural),
].map(([pattern, replacement]) => ({ pattern: new RegExp(pattern, 'iu'), replacement }))

const SINGULAR_RULES = [
  ['s$', ''],
  ['(n)ews$', '$1ews'],
  ['([dti])a$', '$1um'],
  ['(analy|ba|diagno|parenthe|progno|synop|the|ellip|empha|neuro|oa|paraly)ses$', '$1sis'],
  ['([^f])ves$', '$1fe'],
  ['(hive)s$', '$1'],
  ['(tive)s$', '$1'],
  ['([lr]|hoo|lea|loa|thie)ves$', '$1f'],
  ['(^zomb)?([^aeiouy]|qu)ies$', '$2y'],
  ['(s)eries$', '$1eries'],
  ['(m)ovies$', '$1ovie'],
  ['(x|ch|ss|sh)es$', '$1'],
  ['(^[m|l])ice$', '$1ouse'],
  ['(?<!^[a-z])(o)es$', '$1'],
  ['(shoe)s$', '$1'],
  ['(cris|ax|test)es$', '$1is'],
  ['(octop|vir|alumn|fung|cact|foc|hippopotam|radi|stimul|syllab|nucle)i$', '$1us'],
  ['(alias|bias|iris|status|campus|apparatus|virus|walrus|trellis)es$', '$1'],
  ['^(ox)en', '$1'],
  ['(matr|d)ices$', '$1ix'],
  ['(vert|ind)ices$', '$1ex'],
  ['(quiz)zes$', '$1'],
  ['(buz|blit|walt)zes$', '$1z'],
  ['(alumn|alg|larv|vertebr)ae$', '$1a'],
  ['(criteri|phenomen)a$', '$1on'],
  ['([b|r|c]ook|room|smooth)ies$', '$1ie'],
  ...IRREGULARS.map((rule) => rule.singular),
].map(([pattern, replacement]) => ({ pattern: new RegExp(pattern, 'iu'), replacement }))

const UNCOUNTABLE_WORDS = new Set([
  'staff',
  'training',
  'equipment',
  'information',
  'corn',
  'milk',
  'rice',
  'money',
  'species',
  'series',
  'fish',
  'sheep',
  'deer',
  'aircraft',
  'oz',
  'tsp',
  'tbsp',
  'ml',
  'l',
  'water',
  'waters',
  'semen',
  'sperm',
  'bison',
  'grass',
  'hair',
  'mud',
  'elk',
  'luggage',
  'moose',
  'offspring',
  'salmon',
  'shrimp',
  'someone',
  'swine',
  'trout',
  'tuna',
  'corps',
  'scissors',
  'means',
  'mail',
  'metadata',
])
// cspell:enable

function isUpperCaseLetter(char: string) {
  return char !== char.toLowerCase() && char === char.toUpperCase()
}

function isLowerCaseLetter(char: string) {
  return char !== char.toUpperCase() && char === char.toLowerCase()
}

function applyRules(
  rules: readonly { readonly pattern: RegExp; readonly replacement: string }[],
  word: string,
) {
  if (word.length === 0 || UNCOUNTABLE_WORDS.has(word.toLowerCase())) return word
  const rule = rules.findLast((candidate) => candidate.pattern.test(word))
  if (rule === undefined) return null
  const result = word.replace(rule.pattern, rule.replacement)
  const first = result.charAt(0)
  // Humanizer keeps a capitalised word capitalised when the replacement starts in lower case.
  return isUpperCaseLetter(word.charAt(0)) && isLowerCaseLetter(first)
    ? `${first.toUpperCase()}${result.slice(1)}`
    : result
}

/**
 * Humanizer's `Pluralize(inputIsKnownToBeSingular: false)`: a word that already reads as a plural
 * is returned as it is.
 *
 * @param word - The word to pluralize.
 * @returns The plural form Humanizer 2.14.1 gives.
 */
export function pluralize(word: string) {
  const result = applyRules(PLURAL_RULES, word)
  const asSingular = applyRules(SINGULAR_RULES, word)
  const asSingularAsPlural = asSingular === null ? null : applyRules(PLURAL_RULES, asSingular)
  const isAlreadyPlural =
    asSingular !== null &&
    asSingular !== word &&
    `${asSingular}s` !== word &&
    asSingularAsPlural === word &&
    result !== word
  return isAlreadyPlural ? word : (result ?? word)
}
