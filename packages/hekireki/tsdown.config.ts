import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'cli/index': './src/cli/index.ts',
    'bin/zod': './src/bin/zod.ts',
    'bin/valibot': './src/bin/valibot.ts',
    'bin/mermaid-er': './src/bin/mermaid-er.ts',
    'bin/ecto': './src/bin/ecto.ts',
    'bin/arktype': './src/bin/arktype.ts',
    'bin/effect': './src/bin/effect.ts',
    'bin/dbml': './src/bin/dbml.ts',
    'bin/docs': './src/bin/docs.ts',
    'bin/drizzle': './src/bin/drizzle.ts',
    'bin/typebox': './src/bin/typebox.ts',
    'bin/ajv': './src/bin/ajv.ts',
    'bin/sqlalchemy': './src/bin/sqlalchemy.ts',
    'bin/gorm': './src/bin/gorm.ts',
    'bin/sea-orm': './src/bin/sea-orm.ts',
  },
  format: 'esm',
  dts: true,
  outDir: 'dist',
  clean: true,
  target: 'node20',
  shims: true,
  fixedExtension: false,
})
