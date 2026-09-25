import { OpenAPIHono } from '@hono/zod-openapi'
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

const app = new OpenAPIHono().basePath('/api')

export const api = app
  .openapi(getSchemaRoute, getSchemaRouteHandler)
  .openapi(postSchemaReloadRoute, postSchemaReloadRouteHandler)
  .openapi(putSchemaFilesRoute, putSchemaFilesRouteHandler)
  .openapi(getSchemaEventsRoute, getSchemaEventsRouteHandler)
  .openapi(getDbRoute, getDbRouteHandler)
  .openapi(getDbCountsRoute, getDbCountsRouteHandler)
  .openapi(getDbRowsModelNameRoute, getDbRowsModelNameRouteHandler)
  .openapi(postDbRowsModelNameRoute, postDbRowsModelNameRouteHandler)
  .openapi(patchDbRowsModelNameRoute, patchDbRowsModelNameRouteHandler)
  .openapi(deleteDbRowsModelNameRoute, deleteDbRowsModelNameRouteHandler)
  .openapi(postDbSqlRoute, postDbSqlRouteHandler)
  .openapi(postDbExplainRoute, postDbExplainRouteHandler)
  .openapi(postDbAnalyzeRoute, postDbAnalyzeRouteHandler)
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
  .openapi(postPrismaFormatRoute, postPrismaFormatRouteHandler)
  .openapi(postPrismaLintRoute, postPrismaLintRouteHandler)
  .openapi(postPrismaSymbolsRoute, postPrismaSymbolsRouteHandler)
  .openapi(postPrismaCompleteRoute, postPrismaCompleteRouteHandler)
  .openapi(postPrismaHoverRoute, postPrismaHoverRouteHandler)
  .openapi(postPrismaDefinitionRoute, postPrismaDefinitionRouteHandler)
  .openapi(postPrismaReferencesRoute, postPrismaReferencesRouteHandler)
  .openapi(postPrismaRenameRoute, postPrismaRenameRouteHandler)
  .openapi(postPrismaCodeActionsRoute, postPrismaCodeActionsRouteHandler)
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
  .openapi(getDocsRoute, getDocsRouteHandler)

export default app
