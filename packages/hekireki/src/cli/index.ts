#!/usr/bin/env node
/**
 * CLI module for hekireki.
 *
 * Provides the main entry point for the hekireki CLI tool.
 *
 * @module cli
 */
import fs from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

const HELP_TEXT = `⚡️ hekireki - Prisma schema tools

Usage:
  hekireki <command> [options]

Commands:
  docs serve    Start a local server to view the documentation

Options:
  -p, --port <port>    Specify the port (default: 5858)
  -h, --help           Show help

Examples:
  hekireki docs serve
  hekireki docs serve -p 3000`

const DOCS_HELP_TEXT = `⚡️ hekireki docs - Documentation tools

Usage:
  hekireki docs serve [options]

Commands:
  serve    Start a local server to view the documentation

Options:
  -p, --port <port>    Specify the port (default: 5858)
  -h, --help           Show help

Examples:
  hekireki docs serve
  hekireki docs serve -p 3000`

type DocsServeOptions = {
  readonly port: number
}

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string }

/**
 * Parse port from CLI arguments.
 */
const parsePort = (args: readonly string[]): Result<number> => {
  const portIndex = args.findIndex((arg) => arg === '-p' || arg === '--port')

  if (portIndex === -1) {
    return { ok: true, value: 5858 }
  }

  const portStr = args[portIndex + 1]

  if (!portStr || portStr.startsWith('-')) {
    return { ok: false, error: '❌ Error: --port requires a number' }
  }

  const port = parseInt(portStr, 10)

  if (isNaN(port)) {
    return { ok: false, error: `❌ Error: Invalid port number: ${portStr}` }
  }

  return { ok: true, value: port }
}

/**
 * Parse CLI arguments for docs serve command.
 */
const parseDocsServeArgs = (args: readonly string[]): Result<DocsServeOptions> => {
  const portResult = parsePort(args)

  if (!portResult.ok) {
    return portResult
  }

  return { ok: true, value: { port: portResult.value } }
}

/**
 * Start the documentation server.
 */
const startDocsServer = (options: DocsServeOptions): Result<string> => {
  const docsPath = './docs'
  const absolutePath = path.resolve(docsPath)

  if (!fs.existsSync(absolutePath)) {
    return {
      ok: false,
      error: `❌ Error: Directory not found: ${absolutePath}\n   Run "prisma generate" first to generate the documentation.`,
    }
  }

  const indexPath = path.join(absolutePath, 'index.html')

  if (!fs.existsSync(indexPath)) {
    return {
      ok: false,
      error: `❌ Error: index.html not found in ${absolutePath}\n   Run "prisma generate" first to generate the documentation.`,
    }
  }

  const app = new Hono()

  app.get('/', (c) => {
    const html = fs.readFileSync(indexPath, 'utf-8')
    return c.html(html)
  })

  app.use('/*', serveStatic({ root: absolutePath }))

  const server = serve({
    fetch: app.fetch,
    port: options.port,
  })

  process.on('SIGTERM', () => {
    server.close()
    process.exit(0)
  })

  process.on('SIGINT', () => {
    server.close()
    process.exit(0)
  })

  return {
    ok: true,
    value: `✅ Hekireki Docs Server started at http://localhost:${options.port}\n📂 Serving documentation from: ${absolutePath}`,
  }
}

/**
 * Handle docs subcommand.
 */
const handleDocs = (args: readonly string[]): Result<string> => {
  const subcommand = args[0]

  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    return { ok: true, value: DOCS_HELP_TEXT }
  }

  if (subcommand !== 'serve') {
    return { ok: false, error: `❌ Unknown command: docs ${subcommand}\n\n${DOCS_HELP_TEXT}` }
  }

  const parseResult = parseDocsServeArgs(args.slice(1))

  if (!parseResult.ok) {
    return parseResult
  }

  return startDocsServer(parseResult.value)
}

/**
 * Command handlers map.
 */
const commands: Record<string, (args: readonly string[]) => Result<string>> = {
  docs: handleDocs,
}

/**
 * Main CLI entry point for hekireki.
 */
export const hekireki = (): Result<string> => {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '-h' || command === '--help') {
    return { ok: true, value: HELP_TEXT }
  }

  const handler = commands[command]

  if (!handler) {
    return { ok: false, error: `❌ Unknown command: ${command}\n\n${HELP_TEXT}` }
  }

  return handler(args.slice(1))
}

// Execute CLI
const result = hekireki()

if (result.ok) {
  console.log(result.value)
} else {
  console.error(result.error)
  process.exit(1)
}
