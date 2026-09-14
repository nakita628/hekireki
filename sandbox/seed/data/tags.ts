import { defineData } from 'hekireki'

import { schema } from '../generated/seed/schema'

// `defineData(schema, 'Tag', ...)` gives the rows the same type `defineConfig` would: a field Tag
// does not have, or a label that is not a string, does not compile.
export const tags = defineData(schema, 'Tag', [
  { label: 'prisma' },
  { label: 'effect' },
  { label: 'faker' },
])
