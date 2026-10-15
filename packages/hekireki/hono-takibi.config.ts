import { defineConfig } from 'hono-takibi'

export default defineConfig({
  input: 'main.tsp',
  output: 'src/studio/server/routes/index.ts',
  basePath: '/api',
  readonly: true,
  format: {
    printWidth: 100,
    singleQuote: true,
    semi: false,
  },
  // The typed `hc` client of the app (`hc<typeof api>('/').api`): the hooks and the pages import
  // it from here. An index.ts output is its own barrel, so the generator appends to no other.
  client: {
    output: 'src/studio/client/api/index.ts',
  },
  'tanstack-query': {
    output: 'src/studio/client/hooks/index.ts',
  },
  template: {
    routeHandler: true,
    split: true,
  },
  exportSchemas: true,
  docs: {
    output: 'docs/studio-api.md',
    curl: true,
    baseUrl: 'http://localhost:5555',
  },
})
