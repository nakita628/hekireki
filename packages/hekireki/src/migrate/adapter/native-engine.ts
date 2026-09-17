import { spawn } from 'node:child_process'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { text } from 'node:stream/consumers'

import { getEnginesPath } from '@prisma/engines'
import { Effect, Stream } from 'effect'
import * as z from 'zod'

import { exists, readDirectory } from '../../file/index.js'
import type { Engine } from './engine.js'

// Prisma's schema engine as `prisma migrate` runs it: the native binary `@prisma/engines` installs,
// given the database's URL and spoken to over JSON-RPC on its stdin and stdout. The wasm engine
// Studio runs in its own process cannot reach MySQL (it has no MySQL connector at all), nor read a
// PostgreSQL schema other than `public` through a connection; the native one does both, as it does
// for the Prisma CLI.

const RpcMessage = z
  .object({
    id: z
      .number()
      .optional()
      .meta({ description: 'The request it answers, or its own.', example: 1 }),
    method: z
      .string()
      .optional()
      .meta({ description: 'A request of the engine to its caller.', example: 'print' }),
    params: z
      .object({
        content: z
          .string()
          .optional()
          .meta({ description: 'What to print.', example: '-- AlterTable' }),
      })
      .optional()
      .meta({ description: 'The parameters of a request of the engine.' }),
    result: z.unknown().optional().meta({ description: 'What the command returned.' }),
    error: z
      .object({
        message: z
          .string()
          .meta({ description: 'The JSON-RPC message.', example: 'An error happened.' }),
        data: z
          .object({
            message: z
              .string()
              .optional()
              .meta({ description: "The engine's own words for it.", example: 'P3005' }),
          })
          .optional()
          .meta({ description: 'What the engine adds to it.' }),
      })
      .optional()
      .meta({ description: 'Why the command failed.' }),
  })
  .meta({ description: 'One line the schema engine writes on its stdout' })

const DiffResult = z
  .custom<Awaited<ReturnType<Engine['diff']>>>(
    (value) => typeof value === 'object' && value !== null && 'exitCode' in value,
  )
  .meta({
    description: 'What `diff` returns: its exit code, and the script when it was not printed.',
  })

const DiagnoseResult = z
  .custom<Awaited<ReturnType<Engine['diagnoseMigrationHistory']>>>(
    (value) => typeof value === 'object' && value !== null && 'failedMigrationNames' in value,
  )
  .meta({ description: 'What `diagnoseMigrationHistory` returns.' })

const ApplyResult = z
  .custom<Awaited<ReturnType<Engine['applyMigrations']>>>(
    (value) => typeof value === 'object' && value !== null && 'appliedMigrationNames' in value,
  )
  .meta({ description: 'What `applyMigrations` returns.' })

const MarkedResult = z
  .custom<Awaited<ReturnType<Engine['markMigrationApplied']>>>(
    (value) => typeof value === 'object' && value !== null,
  )
  .meta({ description: 'What `markMigrationApplied` and `markMigrationRolledBack` return.' })

/**
 * Where the native schema engine is: `PRISMA_SCHEMA_ENGINE_BINARY` when it is set, as the Prisma
 * CLI reads it, else the `schema-engine-<platform>` `@prisma/engines` downloaded as it installed.
 *
 * @param cwd - what a relative `PRISMA_SCHEMA_ENGINE_BINARY` is resolved from
 * @returns the binary, or null when there is none to run
 */
export function findSchemaEngineBinary(cwd: string) {
  return Effect.gen(function* () {
    const configured = process.env.PRISMA_SCHEMA_ENGINE_BINARY
    if (configured !== undefined && configured !== '') {
      const file = path.resolve(cwd, configured)
      return (yield* exists(file).pipe(Effect.orElseSucceed(() => false))) ? file : null
    }
    const directory = yield* Effect.try({ try: () => getEnginesPath(), catch: () => null }).pipe(
      Effect.orElseSucceed(() => null),
    )
    if (directory === null) return null
    const names = yield* readDirectory(directory).pipe(
      Effect.orElseSucceed((): readonly string[] => []),
    )
    const found = names.find(
      (name) => /^schema-engine-[\w.-]+$/u.test(name) && !name.endsWith('.gz'),
    )
    return found === undefined ? null : path.join(directory, found)
  })
}

/**
 * One command of the native engine: the binary started on the schema and the URL, the request
 * written, every `print` it asks for answered (a script it writes comes that way, not in the
 * result), and the binary let go once it has answered. A process per command: the datamodel is
 * fixed when the engine starts, and nothing is left running between requests.
 */
async function command(
  input: {
    readonly binary: string
    readonly files: readonly { readonly path: string; readonly content: string }[]
    readonly url: string
    readonly cwd: string
  },
  method: string,
  params: unknown,
) {
  const child = spawn(
    input.binary,
    [
      ...input.files.flatMap((file) => ['--datamodels', file.path]),
      '--datasource',
      JSON.stringify({ url: input.url }),
    ],
    {
      cwd: input.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, RUST_BACKTRACE: '1' },
    },
  )
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  lines.on('line', (line) => {
    const message = RpcMessage.safeParse(JSON.parse(line))
    if (!message.success) return
    if (message.data.method === 'print') {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.data.id, result: {} })}\n`)
    } else if (message.data.id === 1) {
      child.stdin.end()
    }
  })
  const logs = text(child.stderr)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })}\n`)
  // Every line until the engine closes its stdout, which it does once stdin is ended.
  const read = await Effect.runPromise(
    Stream.runCollect(Stream.fromAsyncIterable(lines, (error) => error)),
  )
  const messages = read.flatMap((line) => {
    const message = RpcMessage.safeParse(JSON.parse(line))
    return message.success ? [message.data] : []
  })
  const answer = messages.find((message) => message.id === 1 && message.method === undefined)
  if (answer === undefined) {
    const written = await logs
    throw new Error(`The schema engine stopped without answering ${method}: ${written}`)
  }
  if (answer.error !== undefined) {
    throw new Error(answer.error.data?.message ?? answer.error.message)
  }
  const printed = messages.flatMap((message) =>
    message.method === 'print' && message.params?.content !== undefined
      ? [message.params.content]
      : [],
  )
  return { result: answer.result, printed }
}

/**
 * The native engine on the schema and the database's URL, answering the commands Studio sends
 * with the shapes the wasm engine answers them with.
 *
 * @param input - the binary, the schema files (read from where they are), the URL and the directory
 *   the engine runs in
 * @returns the engine
 */
export function openNativeSchemaEngine(input: {
  readonly binary: string
  readonly files: readonly { readonly path: string; readonly content: string }[]
  readonly url: string
  readonly cwd: string
}): Engine {
  return {
    diff: async (params) => {
      const { result, printed } = await command(input, 'diff', params)
      const read = DiffResult.parse(result)
      // The script is printed, not returned: as the CLI writes it, a line to end it.
      return {
        ...read,
        stdout: printed.length === 0 ? (read.stdout ?? null) : `${printed.join('\n')}\n`,
      }
    },
    diagnoseMigrationHistory: async (params) => {
      const { result } = await command(input, 'diagnoseMigrationHistory', params)
      return DiagnoseResult.parse(result)
    },
    applyMigrations: async (params) => {
      const { result } = await command(input, 'applyMigrations', params)
      return ApplyResult.parse(result)
    },
    markMigrationApplied: async (params) => {
      const { result } = await command(input, 'markMigrationApplied', params)
      return MarkedResult.parse(result)
    },
    markMigrationRolledBack: async (params) => {
      const { result } = await command(input, 'markMigrationRolledBack', params)
      return MarkedResult.parse(result)
    },
  }
}
