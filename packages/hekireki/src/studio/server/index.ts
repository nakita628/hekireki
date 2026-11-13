import { OpenAPIHono } from '@hono/zod-openapi'
import { Effect } from 'effect'

import { isLoopbackHostname } from '../../utils/index.js'
import { FORBIDDEN_HOST_MESSAGE } from './constants/index.js'
import {
  deleteDbRowsModelNameRouteHandler,
  getClientRouteHandler,
  getDbCountsRouteHandler,
  getDbRouteHandler,
  getDbRowsModelNameRouteHandler,
  getDocsRouteHandler,
  getMigrateBackupsRouteHandler,
  getMigrateBaselineRouteHandler,
  getMigrateDecisionsRouteHandler,
  getMigrateDiffRouteHandler,
  getMigrateMigrationsMigrationNameRouteHandler,
  getMigrateRouteHandler,
  getMigrateTablesRouteHandler,
  getSchemaEventsRouteHandler,
  getSchemaRouteHandler,
  patchDbRowsModelNameRouteHandler,
  postClientAnalyzeRouteHandler,
  postClientCheckRouteHandler,
  postClientCompleteDetailRouteHandler,
  postClientCompleteRouteHandler,
  postClientFormatRouteHandler,
  postClientHoverRouteHandler,
  postClientPreviewRouteHandler,
  postClientRunRouteHandler,
  postClientSignatureRouteHandler,
  postDbAnalyzeRouteHandler,
  postDbExplainRouteHandler,
  postDbRowsModelNameRouteHandler,
  postDbSqlRouteHandler,
  postMigrateApplyRouteHandler,
  postMigrateBackupsRestoreRouteHandler,
  postMigrateBackupsRouteHandler,
  postMigrateBaselineRouteHandler,
  postMigrateDeployRouteHandler,
  postMigrateMigrationsAppliedRouteHandler,
  postMigrateMigrationsRolledBackRouteHandler,
  postMigrateMigrationsRouteHandler,
  postMigratePlanRouteHandler,
  postMigrateRehearseRouteHandler,
  postPrismaCodeActionsRouteHandler,
  postPrismaCompleteRouteHandler,
  postPrismaDefinitionRouteHandler,
  postPrismaFormatRouteHandler,
  postPrismaHoverRouteHandler,
  postPrismaLintRouteHandler,
  postPrismaReferencesRouteHandler,
  postPrismaRenameRouteHandler,
  postPrismaSymbolsRouteHandler,
  postSchemaReloadRouteHandler,
  putMigrateDecisionsRouteHandler,
  putSchemaFilesRouteHandler,
} from './handlers'
import {
  deleteDbRowsModelNameRoute,
  getClientRoute,
  getDbCountsRoute,
  getDbRoute,
  getDbRowsModelNameRoute,
  getDocsRoute,
  getMigrateBackupsRoute,
  getMigrateBaselineRoute,
  getMigrateDecisionsRoute,
  getMigrateDiffRoute,
  getMigrateMigrationsMigrationNameRoute,
  getMigrateRoute,
  getMigrateTablesRoute,
  getSchemaEventsRoute,
  getSchemaRoute,
  patchDbRowsModelNameRoute,
  postClientAnalyzeRoute,
  postClientCheckRoute,
  postClientCompleteDetailRoute,
  postClientCompleteRoute,
  postClientFormatRoute,
  postClientHoverRoute,
  postClientPreviewRoute,
  postClientRunRoute,
  postClientSignatureRoute,
  postDbAnalyzeRoute,
  postDbExplainRoute,
  postDbRowsModelNameRoute,
  postDbSqlRoute,
  postMigrateApplyRoute,
  postMigrateBackupsRestoreRoute,
  postMigrateBackupsRoute,
  postMigrateBaselineRoute,
  postMigrateDeployRoute,
  postMigrateMigrationsAppliedRoute,
  postMigrateMigrationsRolledBackRoute,
  postMigrateMigrationsRoute,
  postMigratePlanRoute,
  postMigrateRehearseRoute,
  postPrismaCodeActionsRoute,
  postPrismaCompleteRoute,
  postPrismaDefinitionRoute,
  postPrismaFormatRoute,
  postPrismaHoverRoute,
  postPrismaLintRoute,
  postPrismaReferencesRoute,
  postPrismaRenameRoute,
  postPrismaSymbolsRoute,
  postSchemaReloadRoute,
  putMigrateDecisionsRoute,
  putSchemaFilesRoute,
} from './routes'

// main.tsp promises a 422 problem for a request that fails validation, where @hono/zod-openapi
// would answer 400 with the zod error; as the default hook it sees the ZodError itself, before any
// handler runs.
const app = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          type: '/problems/validation-failed',
          title: 'Validation Failed',
          status: 422,
          detail: 'The request failed validation. See `errors` for the offending fields.',
          instance: c.req.path,
          errors: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        422,
        { 'Content-Type': 'application/problem+json' },
      )
    }
  },
}).basePath('/api')

// The API is unauthenticated, so a page on another origin must not reach it even when its DNS name
// resolves to this machine. Registered before the routes, so it runs first (`*` is `/api/*` here).
app.use('*', (c, next) =>
  isLoopbackHostname(new URL(c.req.url).hostname)
    ? next()
    : Promise.resolve(c.text(FORBIDDEN_HOST_MESSAGE, 403)),
)

app.onError((error, c) => {
  Effect.runSync(Effect.logError('unhandled error', error))
  return c.json(
    {
      type: '/problems/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred.',
      instance: c.req.path,
    } as const,
    500,
    { 'Content-Type': 'application/problem+json' },
  )
})

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'Hekireki Studio API', version: '1.0.0' },
})

export const schema = app
  .openapi(getSchemaRoute, getSchemaRouteHandler)
  .openapi(postSchemaReloadRoute, postSchemaReloadRouteHandler)
  .openapi(putSchemaFilesRoute, putSchemaFilesRouteHandler)
  .openapi(getSchemaEventsRoute, getSchemaEventsRouteHandler)

export const db = app
  .openapi(getDbRoute, getDbRouteHandler)
  .openapi(getDbCountsRoute, getDbCountsRouteHandler)
  .openapi(getDbRowsModelNameRoute, getDbRowsModelNameRouteHandler)
  .openapi(postDbRowsModelNameRoute, postDbRowsModelNameRouteHandler)
  .openapi(patchDbRowsModelNameRoute, patchDbRowsModelNameRouteHandler)
  .openapi(deleteDbRowsModelNameRoute, deleteDbRowsModelNameRouteHandler)
  .openapi(postDbSqlRoute, postDbSqlRouteHandler)
  .openapi(postDbExplainRoute, postDbExplainRouteHandler)
  .openapi(postDbAnalyzeRoute, postDbAnalyzeRouteHandler)

export const client = app
  .openapi(getClientRoute, getClientRouteHandler)
  .openapi(postClientAnalyzeRoute, postClientAnalyzeRouteHandler)
  .openapi(postClientCompleteRoute, postClientCompleteRouteHandler)
  .openapi(postClientCompleteDetailRoute, postClientCompleteDetailRouteHandler)
  .openapi(postClientHoverRoute, postClientHoverRouteHandler)
  .openapi(postClientSignatureRoute, postClientSignatureRouteHandler)
  .openapi(postClientFormatRoute, postClientFormatRouteHandler)
  .openapi(postClientCheckRoute, postClientCheckRouteHandler)
  .openapi(postClientPreviewRoute, postClientPreviewRouteHandler)
  .openapi(postClientRunRoute, postClientRunRouteHandler)

export const prisma = app
  .openapi(postPrismaFormatRoute, postPrismaFormatRouteHandler)
  .openapi(postPrismaLintRoute, postPrismaLintRouteHandler)
  .openapi(postPrismaSymbolsRoute, postPrismaSymbolsRouteHandler)
  .openapi(postPrismaCompleteRoute, postPrismaCompleteRouteHandler)
  .openapi(postPrismaHoverRoute, postPrismaHoverRouteHandler)
  .openapi(postPrismaDefinitionRoute, postPrismaDefinitionRouteHandler)
  .openapi(postPrismaReferencesRoute, postPrismaReferencesRouteHandler)
  .openapi(postPrismaRenameRoute, postPrismaRenameRouteHandler)
  .openapi(postPrismaCodeActionsRoute, postPrismaCodeActionsRouteHandler)

export const migrate = app
  .openapi(getMigrateRoute, getMigrateRouteHandler)
  .openapi(getMigrateBaselineRoute, getMigrateBaselineRouteHandler)
  .openapi(postMigrateBaselineRoute, postMigrateBaselineRouteHandler)
  .openapi(getMigrateDiffRoute, getMigrateDiffRouteHandler)
  .openapi(postMigratePlanRoute, postMigratePlanRouteHandler)
  .openapi(postMigrateApplyRoute, postMigrateApplyRouteHandler)
  .openapi(postMigrateRehearseRoute, postMigrateRehearseRouteHandler)
  .openapi(getMigrateTablesRoute, getMigrateTablesRouteHandler)
  .openapi(getMigrateBackupsRoute, getMigrateBackupsRouteHandler)
  .openapi(postMigrateBackupsRoute, postMigrateBackupsRouteHandler)
  .openapi(postMigrateBackupsRestoreRoute, postMigrateBackupsRestoreRouteHandler)
  .openapi(getMigrateMigrationsMigrationNameRoute, getMigrateMigrationsMigrationNameRouteHandler)
  .openapi(postMigrateMigrationsRoute, postMigrateMigrationsRouteHandler)
  .openapi(postMigrateMigrationsAppliedRoute, postMigrateMigrationsAppliedRouteHandler)
  .openapi(postMigrateMigrationsRolledBackRoute, postMigrateMigrationsRolledBackRouteHandler)
  .openapi(getMigrateDecisionsRoute, getMigrateDecisionsRouteHandler)
  .openapi(putMigrateDecisionsRoute, putMigrateDecisionsRouteHandler)
  .openapi(postMigrateDeployRoute, postMigrateDeployRouteHandler)

export const docs = app.openapi(getDocsRoute, getDocsRouteHandler)

export default app
