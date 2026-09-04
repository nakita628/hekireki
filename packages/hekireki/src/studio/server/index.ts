import { OpenAPIHono } from '@hono/zod-openapi'
import {
  deleteDbRowsModelNameRouteHandler,
  getDbCountsRouteHandler,
  getDbRouteHandler,
  getDbRowsModelNameRouteHandler,
  getDocsRouteHandler,
  getSchemaEventsRouteHandler,
  getSchemaRouteHandler,
  patchDbRowsModelNameRouteHandler,
  postDbRowsModelNameRouteHandler,
  postDbSqlRouteHandler,
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
  putSchemaFilesRouteHandler,
} from './handlers'
import {
  deleteDbRowsModelNameRoute,
  getDbCountsRoute,
  getDbRoute,
  getDbRowsModelNameRoute,
  getDocsRoute,
  getSchemaEventsRoute,
  getSchemaRoute,
  patchDbRowsModelNameRoute,
  postDbRowsModelNameRoute,
  postDbSqlRoute,
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
  putSchemaFilesRoute,
} from './routes'

const app = new OpenAPIHono()

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
  .openapi(postPrismaFormatRoute, postPrismaFormatRouteHandler)
  .openapi(postPrismaLintRoute, postPrismaLintRouteHandler)
  .openapi(postPrismaSymbolsRoute, postPrismaSymbolsRouteHandler)
  .openapi(postPrismaCompleteRoute, postPrismaCompleteRouteHandler)
  .openapi(postPrismaHoverRoute, postPrismaHoverRouteHandler)
  .openapi(postPrismaDefinitionRoute, postPrismaDefinitionRouteHandler)
  .openapi(postPrismaReferencesRoute, postPrismaReferencesRouteHandler)
  .openapi(postPrismaRenameRoute, postPrismaRenameRouteHandler)
  .openapi(postPrismaCodeActionsRoute, postPrismaCodeActionsRouteHandler)
  .openapi(getDocsRoute, getDocsRouteHandler)

export default app
