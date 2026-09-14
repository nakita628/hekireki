// Everything `hekireki seed` reads: the schema module written by `prisma generate` types the
// rules, so a model, field or enum member that is not in schema.prisma does not compile.
import { defineConfig } from 'hekireki'

import { schema } from './generated/seed/schema'

export default defineConfig(schema, {
  seed: 42,
  locale: ['ja', 'en'],
  count: 20,
  nullRate: 0.2,
  dates: { from: '2025-01-01', to: '2025-12-31' },
  models: {
    User: {
      count: 30,
      fields: {
        name: (faker) => faker.person.fullName(),
        role: { values: ['EDITOR', 'VIEWER'] },
      },
      // Every user gets a profile and 1 to 8 posts; the seeder deals the posts out to make it so,
      // and stops before inserting if the counts cannot hold.
      relations: { profile: { min: 1 }, posts: { min: 1, max: 8 } },
    },
    Profile: {
      count: 30,
      fields: { age: { min: 18, max: 80 }, bio: { nullRate: 0.4 } },
    },
    Post: {
      count: 120,
      relations: { tags: { min: 0, max: 3 } },
      fields: {
        viewCount: { max: 5000 },
        title: (faker, { row }) => `${faker.lorem.sentence(4)}${row.published ? '' : ' (draft)'}`,
      },
    },
    // Real rows: only the required fields without a default have to be given; the ids come from
    // autoincrement. Every row is checked against the schema before anything is inserted.
    Tag: {
      data: [{ label: 'prisma' }, { label: 'effect' }, { label: 'faker' }, { label: 'sqlite' }],
    },
    Comment: { count: 400 },
    Follow: { count: 150 },
    Category: { count: 15 },
  },
  // To write through Prisma Client instead of the SQLite file directly:
  // client: () => new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:./seed.db' }) }),
})
