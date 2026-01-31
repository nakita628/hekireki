import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'generator/zod/index': './src/generator/zod/index.ts',
    'generator/valibot/index': './src/generator/valibot/index.ts',
    'generator/mermaid-er/index': './src/generator/mermaid-er/index.ts',
    'generator/ecto/index': './src/generator/ecto/index.ts',
    'generator/arktype/index': './src/generator/arktype/index.ts',
    'generator/effect/index': './src/generator/effect/index.ts',
    'generator/dbml/index': './src/generator/dbml/index.ts',
  },
  format: 'esm',
  dts: true,
  outDir: 'dist',
  clean: true,
  target: 'node20',
  shims: true,
  fixedExtension: false,
})
