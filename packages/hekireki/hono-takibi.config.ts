import { defineConfig } from 'hono-takibi'

export default defineConfig({
  input: 'main.tsp',
  output: 'src/studio/server/routes/index.ts',
  basePath: '/api',
  readonly: false,
  format: {
    printWidth: 100,
    singleQuote: true,
    semi: false,
  },
  'tanstack-query': {
    output: 'src/studio/client/hooks/index.ts',
    import: '../lib/index.js',
  },
  template: {
    routeHandler: true,
  },
  exportSchemas: true,
  docs: {
    output: 'docs/studio-api.md',
    curl: true,
    baseUrl: 'http://localhost:5555',
  },
})
