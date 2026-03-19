import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './schema.ts',
  dialect: 'sqlite',
})
