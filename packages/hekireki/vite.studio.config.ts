import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import { getRequestListener } from '@hono/node-server'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { Effect, Exit, Scope } from 'effect'
import { defineConfig } from 'vite-plus'
import type { Plugin } from 'vite-plus'

import { openStudioApp } from './src/studio/server/app.js'

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
      // A scope that lives as long as the dev server: the schema is reloaded on change, and the
      // database, client and type checker stay open.
      const scope = await Effect.runPromise(Scope.make())
      const opened = await Effect.runPromise(
        // Only /api/ reaches the app: Vite serves the client itself.
        openStudioApp({
          schemaPath,
          staticDir: CLIENT_ROOT,
          databaseUrl: process.env.HEKIREKI_DATABASE_URL ?? null,
        }).pipe(Scope.provide(scope), Effect.provide(NodeFileSystem.layer)),
      )
      server.httpServer?.once('close', () => {
        void Effect.runPromise(Scope.close(scope, Exit.void))
      })
      const listener = getRequestListener((request) => opened.app.fetch(request))
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

const MONACO_CHUNK = 'monaco'

/** The size past which a chunk slows the first visit to a page down (Vite's default). */
const CHUNK_SIZE_LIMIT = 500 * 1024

/**
 * The build's chunk size warning for every chunk but the Monaco core, which is as large as it is
 * and loads only with the editor pages.
 */
function chunkSizeWarning(): Plugin {
  return {
    name: 'hekireki-chunk-size',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || chunk.name === MONACO_CHUNK) continue
        const size = Buffer.byteLength(chunk.code)
        if (size > CHUNK_SIZE_LIMIT) {
          this.warn(
            `${chunk.fileName} is ${Math.round(size / 1024)} kB, over ${CHUNK_SIZE_LIMIT / 1024} kB: split it with a dynamic import() or a codeSplitting group.`,
          )
        }
      }
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
    chunkSizeWarning(),
  ],
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    // Monaco's own warning is replaced by the plugin below, which keeps it for every other chunk.
    chunkSizeWarningLimit: Number.POSITIVE_INFINITY,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // The Monaco core in one chunk of a known name: the two editor pages load it, nothing
          // else does, and it cannot be cut further — its services register themselves in module
          // order, and split across chunks the editor fails to start (`serviceIds` of undefined).
          groups: [{ name: MONACO_CHUNK, test: /node_modules[\\/]monaco-editor[\\/]/u }],
        },
      },
    },
  },
})
