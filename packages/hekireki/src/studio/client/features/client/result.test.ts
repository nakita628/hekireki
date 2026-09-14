import { describe, expect, it } from 'vite-plus/test'

import { problemMessage, tableOf } from './result.js'

describe('tableOf', () => {
  it('lays rows of objects out under every key they have, nested values as JSON', () => {
    expect(
      tableOf([
        { id: 1, email: 'ann@example.com', posts: [{ title: 'a' }] },
        { id: 2, email: null, profile: { bio: 'hi' } },
      ]),
    ).toStrictEqual({
      columns: ['id', 'email', 'posts', 'profile'],
      rows: [
        { id: 1, email: 'ann@example.com', posts: '[{"title":"a"}]', profile: null },
        { id: 2, email: null, posts: null, profile: '{"bio":"hi"}' },
      ],
    })
  })

  it('shows one object as one row', () => {
    expect(tableOf({ _count: { _all: 3 }, published: true })).toStrictEqual({
      columns: ['_count', 'published'],
      rows: [{ _count: '{"_all":3}', published: true }],
    })
  })

  it('has no table for a scalar, an empty array or an array of scalars', () => {
    expect(tableOf(3)).toBeNull()
    expect(tableOf(null)).toBeNull()
    expect(tableOf([])).toBeNull()
    expect(tableOf([1, 2])).toBeNull()
    expect(tableOf([{ id: 1 }, [2]])).toBeNull()
  })
})

describe('problemMessage', () => {
  it('reads the detail of the problem body the client kept on the error', () => {
    const problem = { type: '/problems/validation-failed', detail: 'Unknown argument `nope`.' }
    expect(
      problemMessage(
        Object.assign(new Error('422 Unprocessable Entity'), { detail: { data: problem } }),
      ),
    ).toBe('Unknown argument `nope`.')
    expect(
      problemMessage(
        Object.assign(new Error('503 Service Unavailable'), {
          detail: { data: JSON.stringify({ detail: 'No database is connected.' }) },
        }),
      ),
    ).toBe('No database is connected.')
    expect(problemMessage(new Error('Failed to fetch'))).toBe('Failed to fetch')
    // A body that is not JSON (a proxy's HTML page) leaves the status line.
    expect(
      problemMessage(
        Object.assign(new Error('502 Bad Gateway'), {
          detail: { data: '<html>Bad Gateway</html>' },
        }),
      ),
    ).toBe('502 Bad Gateway')
    expect(problemMessage('nope')).toBe('The query could not be run.')
  })
})
