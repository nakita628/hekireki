import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { exists, readDirectory, removePath } from '../file/index.js'
import { fmtMarkdown } from '../format/index.js'
import { erDiagramSvg, neighborhood, schemaSvg } from '../generator/dbml.js'
import { DOCS_FILES, docsMarkdown, modelDiagramPath } from '../generator/docs.js'
import { queryExamples } from '../generator/query-examples.js'
import { schemaSql } from '../migrate/adapter/schema-sql.js'
import { dialectOf, readSchemaFiles, schemaText } from '../schema/index.js'
import { formatSql } from '../sql/index.js'
import { makeSchema } from '../studio/server/domain/schema.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'
import { requireOutput } from './output.js'
import { compileQueries } from './query-compiler.js'

/**
 * Writes the schema's docs into the directory `output` names: README.md (each model with its
 * fields, indexes, relations, `CREATE TABLE` and Prisma Client queries beside the SQL they send),
 * beside the ER diagram it opens with (er.svg) and one diagram per model with a relation
 * (tables/<Model>.svg: the model and the models it joins). The diagram of a model that is gone is
 * removed, so a directory written again holds none that is stale.
 *
 * `output` names the directory, so a path with an extension is refused rather than written into
 * as one; `theme` (`light`, `dark`) is the one option, and any other is refused.
 */
export function docs(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const dir = yield* requireOutput(options, 'Hekireki-Docs')
    if (path.extname(dir) !== '') {
      return yield* new GeneratorConfigError({
        message: `output for Hekireki-Docs names the directory the docs are written into; "${dir}" ends in "${path.extname(dir)}".`,
      })
    }
    const config = options.generator.config ?? {}
    const unread = Object.keys(config).filter((name) => name !== 'theme')
    if (unread.length > 0) {
      return yield* new GeneratorConfigError({
        message: `Hekireki-Docs does not read ${unread.map((name) => `"${name}"`).join(', ')}; it takes theme.`,
      })
    }
    const theme = getString(config.theme) === 'dark' ? 'dark' : 'light'
    // CockroachDB reads as PostgreSQL elsewhere, but its tables are not PostgreSQL's to write.
    const provider = options.datasources[0]?.activeProvider ?? null
    const dialect = provider === 'cockroachdb' ? null : dialectOf(provider)
    const files = dialect === null ? [] : yield* readSchemaFiles(options.schemaPath)
    const statements =
      dialect === null ? [] : yield* schemaSql({ files, dialect, cwd: process.cwd() })
    // Each query beside the SQL it sends, compiled by the project's own Prisma Client; where
    // there is none to compile with (no `@prisma/client`, or one older than Prisma 7), the calls
    // are shown alone.
    const examples = queryExamples(options.dmmf.datamodel)
    const compiled =
      dialect === null
        ? null
        : yield* compileQueries({
            schemaPath: options.schemaPath,
            datamodel: schemaText(files),
            dialect,
            examples,
          }).pipe(Effect.orElseSucceed(() => null))
    const queries = yield* Effect.forEach(
      compiled ?? examples.map((example) => ({ example, statements: null, error: null })),
      ({ example, statements: planned, error }) =>
        Effect.forEach(planned ?? [], ({ sql, params }) =>
          formatSql(sql, dialect).pipe(Effect.map((text) => ({ sql: text, params }))),
        ).pipe(
          Effect.map((formatted) => ({
            example,
            statements: planned === null ? null : formatted,
            error,
          })),
        ),
    )
    const readme = yield* fmtMarkdown(
      docsMarkdown({ datamodel: options.dmmf.datamodel, statements, queries }),
    )
    const schema = makeSchema({
      dmmf: { datamodel: options.dmmf.datamodel },
      files: [],
      provider: null,
      blocks: [],
    })
    const diagrams = schema.models
      .filter((model) =>
        schema.relations.some((r) => r.from.model === model.name || r.to.model === model.name),
      )
      .map((model) => ({
        name: modelDiagramPath(model.name),
        data: schemaSvg(neighborhood(schema, model.name), theme),
      }))
    const modelsDir = path.join(dir, DOCS_FILES.models)
    const kept = new Set(diagrams.map(({ name }) => path.basename(name)))
    const present = (yield* exists(modelsDir)) ? yield* readDirectory(modelsDir) : []
    yield* Effect.forEach(
      present.filter((name) => name.endsWith('.svg') && !kept.has(name)),
      (name) => removePath(path.join(modelsDir, name)),
      { discard: true },
    )
    return yield* Effect.forEach(
      [
        { name: 'README.md', data: readme },
        { name: DOCS_FILES.diagram, data: erDiagramSvg(options.dmmf.datamodel, theme) },
        ...diagrams,
      ],
      ({ name, data }) => {
        const file = path.join(dir, name)
        return emitRaw(data, path.dirname(file), file)
      },
      { discard: true },
    )
  })
}
