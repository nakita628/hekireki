#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

export const HELP_TEXT = `⚡️ hekireki - Prisma schema tools

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

export const DOCS_HELP_TEXT = `⚡️ hekireki docs - Documentation tools

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

export function parsePort(args: readonly string[]) {
  const portIndex = args.findIndex((arg) => arg === '-p' || arg === '--port')
  if (portIndex === -1) {
    return { ok: true, value: 5858 } as const
  }
  const portStr = args[portIndex + 1]
  if (!portStr || portStr.startsWith('-')) {
    return { ok: false, error: '❌ Error: --port requires a number' } as const
  }
  const port = parseInt(portStr, 10)
  if (Number.isNaN(port)) {
    return { ok: false, error: `❌ Error: Invalid port number: ${portStr}` } as const
  }
  return { ok: true, value: port } as const
}

function parseDocsServeArgs(args: readonly string[]) {
  const portResult = parsePort(args)
  if (!portResult.ok) {
    return portResult
  }
  return { ok: true, value: { port: portResult.value } } as const
}

function startDocsServer(options: { readonly port: number }) {
  const docsPath = './docs'
  const absolutePath = path.resolve(docsPath)
  if (!fs.existsSync(absolutePath)) {
    return {
      ok: false,
      error: `❌ Error: Directory not found: ${absolutePath}\n   Run "prisma generate" first to generate the documentation.`,
    } as const
  }
  const indexPath = path.join(absolutePath, 'index.html')
  if (!fs.existsSync(indexPath)) {
    return {
      ok: false,
      error: `❌ Error: index.html not found in ${absolutePath}\n   Run "prisma generate" first to generate the documentation.`,
    } as const
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
    value: `⚡️ Hekireki Docs Server started at http://localhost:${options.port}\n📂 Serving documentation from: ${absolutePath}`,
  } as const
}

export function handleDocs(args: readonly string[]) {
  const subcommand = args[0]
  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    return { ok: true, value: DOCS_HELP_TEXT } as const
  }
  if (subcommand !== 'serve') {
    return {
      ok: false,
      error: `❌ Unknown command: docs ${subcommand}\n\n${DOCS_HELP_TEXT}`,
    } as const
  }
  const parseResult = parseDocsServeArgs(args.slice(1))
  if (!parseResult.ok) {
    return parseResult
  }
  return startDocsServer(parseResult.value)
}

export function hekireki(args: readonly string[]) {
  const command = args[0]
  if (!command || command === '-h' || command === '--help') {
    return { ok: true, value: HELP_TEXT } as const
  }
  if (command === 'docs') {
    return handleDocs(args.slice(1))
  }
  return { ok: false, error: `❌ Unknown command: ${command}\n\n${HELP_TEXT}` } as const
}

const result = hekireki(process.argv.slice(2))

if (result.ok) {
  console.log(result.value)
} else {
  console.error(result.error)
  process.exit(1)
}
