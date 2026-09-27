import { describe, expect, it } from 'vite-plus/test'

import { pluralize } from './humanizer.js'

// Every expected value is what Humanizer 2.14.1 itself returns for
// `word.Pluralize(inputIsKnownToBeSingular: false)` — the call `dotnet ef dbcontext scaffold`
// names DbSets with.
describe('pluralize', () => {
  it.each([
    ['Account', 'Accounts'],
    ['Category', 'Categories'],
    ['Status', 'Statuses'],
    ['Box', 'Boxes'],
    ['Match', 'Matches'],
    ['Wish', 'Wishes'],
    ['Glass', 'Glasses'],
    ['Quiz', 'Quizzes'],
    ['Buzz', 'Buzzes'],
    ['Matrix', 'Matrices'],
    ['Index', 'Indices'],
    ['Vertex', 'Vertices'],
    ['Mouse', 'Mice'],
    ['Ox', 'Oxen'],
    ['Octopus', 'Octopi'],
    ['Axis', 'Axes'],
    ['Crisis', 'Crises'],
    ['Datum', 'Data'],
    ['Medium', 'Media'],
    ['Criterion', 'Criteria'],
    ['Wife', 'Wives'],
    ['Leaf', 'Leaves'],
    ['Half', 'Halves'],
    ['Hero', 'Heroes'],
    ['Photo', 'Photos'],
    ['Hive', 'Hives'],
    ['Movie', 'Movies'],
  ])('applies the rule for %s', (word, plural) => {
    expect(pluralize(word)).toBe(plural)
  })

  it.each([
    ['Person', 'People'],
    ['Child', 'Children'],
    ['Man', 'Men'],
    ['Human', 'Humans'],
    ['Move', 'Moves'],
    ['Tooth', 'Teeth'],
    ['Database', 'Databases'],
    ['Cache', 'Caches'],
    ['Zombie', 'Zombies'],
    ['Personnel', 'Personnel'],
    ['RefActionChild', 'RefActionChildren'],
  ])('knows the irregular %s, also at the end of a compound name', (word, plural) => {
    expect(pluralize(word)).toBe(plural)
  })

  it.each([
    ['Ex', 'Exes'],
    ['Is', 'Are'],
    ['Bus', 'Buses'],
    ['Tie', 'Ties'],
  ])('matches the whole-word irregular %s only on its own', (word, plural) => {
    expect(pluralize(word)).toBe(plural)
  })

  it.each(['Equipment', 'Fish', 'Metadata', 'Sheep', 'Series', 'News', 'Money', 'Staff'])(
    'leaves the uncountable %s as it is',
    (word) => {
      expect(pluralize(word)).toBe(word)
    },
  )

  it.each(['People', 'Posts', 'Children', 'Data', 'Indices', 'UserMetadata'])(
    'leaves %s, which already reads as a plural, as it is',
    (word) => {
      expect(pluralize(word)).toBe(word)
    },
  )

  it.each([
    ['OrderItem', 'OrderItems'],
    ['OrderLineItem', 'OrderLineItems'],
    ['Computed', 'Computeds'],
    // Humanizer reads the final "ch" as in "match"; the scaffolder's DbSet is Monarches too.
    ['Monarch', 'Monarches'],
  ])('pluralizes the model name %s as the scaffolder does', (word, plural) => {
    expect(pluralize(word)).toBe(plural)
  })

  it.each([
    ['x', 'xes'],
    ['ab', 'abs'],
  ])('keeps the case of a lower-case %s', (word, plural) => {
    expect(pluralize(word)).toBe(plural)
  })

  it('returns an empty word as it is', () => {
    expect(pluralize('')).toBe('')
  })
})
