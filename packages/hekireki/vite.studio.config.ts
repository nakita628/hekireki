import path from 'node:path'

import { getRequestListener } from '@hono/node-server'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { Effect } from 'effect'
import { defineConfig } from 'vite-plus'
import type { Plugin } from 'vite-plus'

import { fileSystemLayer } from './src/file/index.js'
import { createStudioApi } from './src/studio/server/app.js'
import { connectDatabase, createStudioState } from './src/studio/server/services/index.js'

const CLIENT_ROOT = path.resolve(import.meta.dirname, 'src/studio/client')
const OUT_DIR = path.resolve(import.meta.dirname, 'dist/studio')

// HEKIREKI_SCHEMA overrides the schema served by `vp dev` (default: the example schema);
// HEKIREKI_DATABASE_URL connects it to a database.
function studioApi(): Plugin {
  return {
    name: 'hekireki-studio-api',
    apply: 'serve',
    async configureServer(server) {
      const schemaPath = path.resolve(
        process.env.HEKIREKI_SCHEMA ??
          path.resolve(import.meta.dirname, '../../example/schema.prisma'),
      )
      const state = createStudioState({ schemaPath })
      const reload = Effect.provide(state.reload(), fileSystemLayer)
      const snapshot = await Effect.runPromise(reload)
      const db = await Effect.runPromise(
        Effect.provide(
          connectDatabase({
            explicitUrl: process.env.HEKIREKI_DATABASE_URL ?? null,
            schemaProvider: snapshot.schema?.provider ?? null,
            cwd: process.cwd(),
            schemaDir: path.dirname(schemaPath),
            env: process.env,
          }),
          fileSystemLayer,
        ),
      )
      const api = createStudioApi(state, db)
      const listener = getRequestListener((request) => api.fetch(request))
      server.watcher.add(schemaPath)
      server.watcher.on('change', (file) => {
        if (file.endsWith('.prisma')) void Effect.runPromise(reload)
      })
      // Mounting on '/api' would strip the prefix the Hono app routes on, so the path is checked here.
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/')) {
          void listener(req, res)
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  root: CLIENT_ROOT,
  plugins: [
    // File-based routes under src/studio/client/routes → routeTree.gen.ts (imported relatively).
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: path.join(CLIENT_ROOT, 'routes'),
      generatedRouteTree: path.join(CLIENT_ROOT, 'routeTree.gen.ts'),
      quoteStyle: 'single',
      semicolons: false,
    }),
    tailwindcss(),
    react(),
    studioApi(),
  ],
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
  },
})
