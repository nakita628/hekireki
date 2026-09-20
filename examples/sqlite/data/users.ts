import { defineData } from 'hekireki'
import type { Row } from 'hekireki'

import { schema } from '../generated/seed/schema'

// A single row kept apart: `Row<typeof schema, 'User'>` is what one element of `data` must be.
const cy: Row<typeof schema, 'User'> = {
  email: 'cy@example.com',
  name: 'Cy Young',
  createdAt: '2025-03-02T08:15:00.000Z',
  profile: {},
}

// Rows nested under a parent name the key the parent fills, so they can be kept apart too:
// a post under a user leaves `authorId` to the nesting.
const annPosts: readonly Row<typeof schema, 'Post', 'authorId'>[] = [
  {
    title: 'Hello, Prisma',
    body: 'A first look at the schema language.',
    published: true,
    viewCount: 128,
    tags: [{ label: 'prisma' }, { label: 'effect' }],
    comments: [
      { body: 'Clear write-up, thanks.', author: { email: 'bob@example.com' } },
      { body: 'Which index type?', author: { email: 'cy@example.com' } },
    ],
  },
  {
    title: 'Indexes matter',
    body: 'Why @@index earns its keep.',
    published: true,
    viewCount: 42,
    tags: [{ label: 'prisma' }],
    comments: [{ body: 'Posted anonymously.' }],
  },
]

export const users = defineData(schema, 'User', [
  {
    email: 'ann@example.com',
    name: 'Ann Lovelace',
    role: 'ADMIN',
    profile: {
      bio: 'Wrote the first program.',
      website: 'https://example.com/ann',
      age: 36,
      verified: true,
    },
    posts: annPosts,
    // Follow rows nested under `followers` get followingId = Ann; `follower` names who follows her.
    followers: [
      { follower: { email: 'bob@example.com' } },
      { follower: { email: 'cy@example.com' } },
    ],
  },
  {
    email: 'bob@example.com',
    name: 'Bob Martin',
    role: 'EDITOR',
    profile: { age: 71 },
    posts: [{ title: 'Draft: routing' }],
    followers: [{ follower: { email: 'cy@example.com' } }],
  },
  cy,
])
