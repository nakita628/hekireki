#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

const args = process.argv.slice(2)

const printHelp = () => {
  console.log(`
  Usage
  $ hekireki-docs [command] [options]

  Commands
    serve    Start a local server to view the documentation

  Options
    --port, -p   Specify the port (default: 5858)
    --path       Path to the docs directory (default: ./docs)
    --help, -h   Show this help message
`)
}

const parseArgs = () => {
  const options = {
    command: '',
    port: 5858,
    path: './docs',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === 'serve') {
      options.command = 'serve'
    } else if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10)
    } else if (arg === '--path') {
      options.path = args[++i]
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return options
}

const startServer = (port: number, servePath: string) => {
  const absolutePath = path.resolve(servePath)

  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: Directory not found: ${absolutePath}`)
    console.error('Make sure to run "prisma generate" first to generate the documentation.')
    process.exit(1)
  }

  const indexPath = path.join(absolutePath, 'index.html')
  if (!fs.existsSync(indexPath)) {
    console.error(`Error: index.html not found in ${absolutePath}`)
    console.error('Make sure to run "prisma generate" first to generate the documentation.')
    process.exit(1)
  }

  const app = new Hono()

  app.get('/', (c) => {
    const html = fs.readFileSync(indexPath, 'utf-8')
    return c.html(html)
  })

  app.use('/*', serveStatic({ root: absolutePath }))

  console.log(`Hekireki Docs Server started at http://localhost:${port}`)
  console.log(`Serving documentation from: ${absolutePath}`)

  const server = serve({
    fetch: app.fetch,
    port,
  })

  process.on('SIGTERM', () => {
    server.close()
    process.exit(0)
  })

  process.on('SIGINT', () => {
    server.close()
    process.exit(0)
  })
}

const main = () => {
  const options = parseArgs()

  if (!options.command) {
    console.error('Error: No command specified')
    printHelp()
    process.exit(1)
  }

  switch (options.command) {
    case 'serve':
      startServer(options.port, options.path)
      break
    default:
      console.error(`Error: Unknown command "${options.command}"`)
      printHelp()
      process.exit(1)
  }
}

main()
