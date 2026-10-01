import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { GeneratorConfigError } from './errors.js'

/**
 * The `output` the generator block names. Without one Prisma would write beside the schema, so
 * the generator refuses instead, naming itself as `prisma generate` shows it.
 */
export function requireOutput(options: GeneratorOptions, prettyName: string) {
  const output = options.generator.isCustomOutput ? options.generator.output?.value : undefined
  return output
    ? Effect.succeed(output)
    : Effect.fail(
        new GeneratorConfigError({
          message: `output is required for ${prettyName}. Please specify output in your generator config.`,
        }),
      )
}

/**
 * The file `output` names, or `fileName` in it when it names a directory, with the directory to
 * make before writing.
 */
export function outputFile(output: string, fileName: string) {
  return path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, fileName) }
}
