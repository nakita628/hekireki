import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'cli/index': './src/cli/index.ts',
    'generator/zod/index': './src/generator/zod/index.ts',
    'generator/valibot/index': './src/generator/valibot/index.ts',
    'generator/mermaid-er/index': './src/generator/mermaid-er/index.ts',
    'generator/ecto/index': './src/generator/ecto/index.ts',
    'generator/arktype/index': './src/generator/arktype/index.ts',
    'generator/effect/index': './src/generator/effect/index.ts',
    'generator/dbml/index': './src/generator/dbml/index.ts',
    'generator/docs/index': './src/generator/docs/index.tsx',
    'generator/drizzle/index': './src/generator/drizzle/index.ts',
    'generator/typebox/index': './src/generator/typebox/index.ts',
    'generator/ajv/index': './src/generator/ajv/index.ts',
    'generator/sqlalchemy/index': './src/generator/sqlalchemy/index.ts',
    'generator/gorm/index': './src/generator/gorm/index.ts',
    'generator/sea-orm/index': './src/generator/sea-orm/index.ts',
  },
  format: 'esm',
  dts: true,
  outDir: 'dist',
  clean: true,
  target: 'node20',
  shims: true,
  fixedExtension: false,
})
