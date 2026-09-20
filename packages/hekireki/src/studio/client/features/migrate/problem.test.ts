import { describe, expect, it } from 'vite-plus/test'

import { problemReason } from './problem.js'

/** What hono's `parseResponse` throws for a response that is not ok. */
function refused(data: unknown) {
  return Object.assign(new Error('503 Service Unavailable'), { detail: { data } })
}

describe('problemReason', () => {
  it("gives the server's detail rather than the status line", () => {
    expect(
      problemReason(
        refused({
          status: 503,
          detail:
            'Migration `20260201_profile` failed to apply cleanly.\nDatabase error: UNIQUE constraint failed: User.email',
        }),
      ),
    ).toBe(
      'Migration `20260201_profile` failed to apply cleanly.\nDatabase error: UNIQUE constraint failed: User.email',
    )
  })

  it('gives what each error of a validation problem says, over its general detail', () => {
    expect(
      problemReason(
        refused({
          status: 422,
          detail: 'The migration could not be planned.',
          errors: [{ field: 'config', message: 'User.nmae: User has no field nmae.' }],
        }),
      ),
    ).toBe('User.nmae: User has no field nmae.')
  })

  it("falls back to the error's own message when the request never reached the server", () => {
    expect(problemReason(new TypeError('Failed to fetch'))).toBe('Failed to fetch')
    expect(problemReason('nothing')).toBeNull()
  })
})
