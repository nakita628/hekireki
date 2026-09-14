// Seed config for example/schema.prisma, typed against the schema module `hekireki-seed` writes:
// only the models, fields and enum members of the schema are accepted, and every bound fits its
// field's type. From the repository root, after `pnpm -F hekireki build`:
//
//   hekireki seed --config example/hekireki.config.ts --sql example/seed.sql
//
// writes the rows as a PostgreSQL script; with a database, `--url postgresql://...` inserts them,
// or `client: () => new PrismaClient({ adapter })` below writes them through Prisma Client.
import { defineConfig } from 'hekireki'

import { schema } from './generated/seed/schema'

export default defineConfig(schema, {
  seed: 42,
  locale: ['ja', 'en'],
  count: 20,
  dates: { from: '2025-01-01', to: '2025-12-31' },
  models: {
    User: {
      count: 50,
      fields: {
        role: { values: ['EDITOR', 'VIEWER'] },
        interests: { min: 1, max: 4 },
        name: (faker) => faker.person.fullName(),
      },
    },
    Post: {
      count: 200,
      relations: { tags: { min: 0, max: 3 } },
      fields: {
        viewCount: { max: 5000 },
        content: { nullRate: 0.3 },
        title: (faker, { row }) => `${faker.lorem.sentence(4)} (${row.visibility ?? 'PUBLIC'})`,
      },
    },
    // Real rows: only the required fields without a default have to be given, and every row
    // is checked against the schema before anything is inserted.
    Tag: {
      data: [{ label: 'prisma' }, { label: 'effect' }, { label: 'faker' }, { label: 'seed' }],
    },
    Comment: { count: 600 },
    Follow: { count: 150 },
    Category: { count: 12 },
    Order: { count: 80, fields: { total: { min: 10, max: 500 } } },
    OrderItem: { count: 240 },
    AuditLog: { count: 30 },
    Actor: { count: 20 },
    Film: { count: 10, relations: { actors: { min: 2, max: 6 } } },
  },
})
