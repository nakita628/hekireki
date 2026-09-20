// Every model from real rows, no faker anywhere, and no id written by hand. `pnpm seed:data` runs it.
//
// The rows live in data/*.ts, typed with `defineData(schema, 'Model', rows)` and `Row<typeof
// schema, 'Model'>`. `hekireki seed` resolves the imports without an extension to the .ts files, as a
// bundler would, so no tsconfig setting is needed.
//
// Children are nested under their parent (`posts`, `profile`, `comments`, `children`): the seeder
// makes the parent's id and fills the child's key with it. A parent elsewhere is named by a unique
// key (`author: { email }`); an implicit many-to-many lists the other side by key (`tags`). A row
// carries only the required fields that have no @default; the rest comes from the schema, and
// every row is checked against it before anything is inserted.
import { defineConfig } from 'hekireki'

import { categories } from './data/categories'
import { tags } from './data/tags'
import { users } from './data/users'
import { schema } from './generated/seed/schema'

export default defineConfig(schema, {
  url: 'file:./seed.db',
  models: {
    Tag: { data: tags },
    User: { data: users },
    Category: { data: categories },
  },
})
