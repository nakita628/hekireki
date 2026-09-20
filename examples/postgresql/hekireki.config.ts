// A postgresql database to try `hekireki seed` and `hekireki studio` on: faker rows bounded per
// parent, real rows for the tags and the category tree, and a schema module `prisma generate`
// wrote next to it. test/db/seed.test.ts runs this same config against a real server.
import { defineConfig } from 'hekireki'

import { schema } from './generated/seed/schema'

export default defineConfig(schema, {
  // The database of examples/compose.yaml; `hekireki seed` writes here and `hekireki studio` opens it.
  url: 'postgresql://postgres:postgres@localhost:5432/seed',
  seed: 7,
  locale: ['ja', 'en'],
  nullRate: 0.2,
  dates: { from: '2025-01-01', to: '2025-12-31' },
  models: {
    Tag: { data: [{ label: 'prisma' }, { label: 'effect' }, { label: 'faker' }] },
    User: {
      count: 20,
      fields: { name: (faker) => faker.person.fullName() },
      // Every user gets a profile and 1 to 6 posts; the seeder deals the posts out to make it so.
      relations: { profile: { min: 1 }, posts: { min: 1, max: 6 } },
    },
    Profile: { count: 20, fields: { balance: { min: 0, max: 5000 } } },
    Post: { count: 60, relations: { tags: { min: 0, max: 3 } } },
    Comment: { count: 150 },
    Follow: { count: 60 },
    Category: {
      data: [{ name: 'Engineering', children: [{ name: 'Databases' }, { name: 'Frontend' }] }],
    },
  },
})
