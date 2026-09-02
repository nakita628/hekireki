import { defineConfig } from 'hono-takibi'

export default defineConfig({
  input: 'main.tsp',
  output: 'src/studio/server/routes/index.ts',
  // `readonly` also wraps branded scalars (`Readonly<number & $brand<'Skip'>>`), which no longer
  // matches the scalar the use cases take, so the generated types stay mutable.
  readonly: false,
  format: {
    printWidth: 100,
    singleQuote: true,
    semi: false,
  },
  'tanstack-query': {
    output: 'src/studio/client/hooks/index.ts',
    import: '../lib/client.js',
  },
  template: {
    routeHandler: true,
  },
  exportSchemas: true,
  exportSchemasTypes: true,
  docs: {
    output: 'docs/studio-api.md',
    curl: true,
    baseUrl: 'http://localhost:5858',
  },
})
