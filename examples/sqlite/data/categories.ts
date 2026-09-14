import { defineData } from 'hekireki'

import { schema } from '../generated/seed/schema'

export const categories = defineData(schema, 'Category', [
  {
    name: 'Engineering',
    children: [{ name: 'Databases' }, { name: 'Frontend', children: [{ name: 'CSS' }] }],
  },
])
