import { describe, expect, it } from 'vite-plus/test'

import { search, segments } from './match.js'

function labels(items: readonly { readonly item: { readonly label: string } }[]) {
  return items.map(({ item }) => item.label)
}

function entries(...names: readonly string[]) {
  return names.map((label) => ({ label }))
}

describe('search', () => {
  it('keeps every entry in the given order when nothing is typed', () => {
    expect(labels(search(entries('Post', 'User', 'Comment'), '  '))).toStrictEqual([
      'Post',
      'User',
      'Comment',
    ])
  })

  it('drops the entries the query is not in', () => {
    expect(labels(search(entries('Post', 'User'), 'usr'))).toStrictEqual(['User'])
  })

  it('matches the letters in order rather than as a substring', () => {
    expect(labels(search(entries('UserAccount'), 'ua'))).toStrictEqual(['UserAccount'])
    expect(labels(search(entries('UserAccount'), 'ub'))).toStrictEqual([])
  })

  it('ignores case in both the query and the label', () => {
    expect(labels(search(entries('User'), 'USER'))).toStrictEqual(['User'])
  })

  it('ranks the shorter label first when both match from the start', () => {
    expect(labels(search(entries('PostComment', 'Post'), 'post'))).toStrictEqual([
      'Post',
      'PostComment',
    ])
  })

  it('ranks a match on word starts above one buried mid-word', () => {
    expect(labels(search(entries('Purchase', 'PostComment'), 'pc'))).toStrictEqual([
      'PostComment',
      'Purchase',
    ])
  })

  it('reads a camel hump and an underscore as word starts alike', () => {
    expect(labels(search(entries('audit_log', 'Analytics'), 'al'))).toStrictEqual([
      'audit_log',
      'Analytics',
    ])
    expect(labels(search(entries('Metadata', 'createdAt'), 'dat'))).toStrictEqual([
      'createdAt',
      'Metadata',
    ])
  })

  it('reports where the query landed so the list can emphasise those letters', () => {
    expect(search(entries('UserAccount'), 'ua')[0]?.indices).toStrictEqual([0, 4])
  })

  it('keeps the given order between entries that score the same', () => {
    expect(labels(search(entries('Alpha', 'Alpha'), 'alpha'))).toStrictEqual(['Alpha', 'Alpha'])
  })

  it('reads the dot of a field label as a word start, so its own name finds it', () => {
    expect(labels(search(entries('Post.published', 'User.email'), 'email'))).toStrictEqual([
      'User.email',
    ])
  })

  it('finds a field through its model, and still ranks the model itself first', () => {
    expect(labels(search(entries('User', 'User.email'), 'usemail'))).toStrictEqual(['User.email'])
    expect(labels(search(entries('User.email', 'User'), 'user'))).toStrictEqual([
      'User',
      'User.email',
    ])
  })

  it('drops whitespace from the query instead of matching it', () => {
    expect(labels(search(entries('User'), 'us er'))).toStrictEqual(['User'])
  })
})

describe('segments', () => {
  it('returns the whole label as one unmatched run when nothing matched', () => {
    expect(segments('User', [])).toStrictEqual([{ start: 0, text: 'User', matched: false }])
  })

  it('joins adjacent matched letters into one run', () => {
    expect(segments('Post', [0, 1, 2, 3])).toStrictEqual([
      { start: 0, text: 'Post', matched: true },
    ])
  })

  it('alternates the runs and keeps the label readable end to end', () => {
    const runs = segments('UserAccount', [0, 4])
    expect(runs).toStrictEqual([
      { start: 0, text: 'U', matched: true },
      { start: 1, text: 'ser', matched: false },
      { start: 4, text: 'A', matched: true },
      { start: 5, text: 'ccount', matched: false },
    ])
    expect(runs.map((run) => run.text).join('')).toBe('UserAccount')
  })
})
