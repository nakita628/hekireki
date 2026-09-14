import { OpenAPIHono } from '@hono/zod-openapi'
import {
  deleteDbRowsModelNameRouteHandler,
  getClientRouteHandler,
  getDbCountsRouteHandler,
  getDbRouteHandler,
  getDbRowsModelNameRouteHandler,
  getDocsRouteHandler,
  getSchemaEventsRouteHandler,
  getSchemaRouteHandler,
  patchDbRowsModelNameRouteHandler,
  postClientAnalyzeRouteHandler,
  postClientCheckRouteHandler,
  postClientCompleteDetailRouteHandler,
  postClientCompleteRouteHandler,
  postClientHoverRouteHandler,
  postClientRunRouteHandler,
  postClientSignatureRouteHandler,
  postDbAnalyzeRouteHandler,
  postDbExplainRouteHandler,
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
  getClientRoute,
  getDbCountsRoute,
  getDbRoute,
  getDbRowsModelNameRoute,
  getDocsRoute,
  getSchemaEventsRoute,
  getSchemaRoute,
  patchDbRowsModelNameRoute,
  postClientAnalyzeRoute,
  postClientCheckRoute,
  postClientCompleteDetailRoute,
  postClientCompleteRoute,
  postClientHoverRoute,
  postClientRunRoute,
  postClientSignatureRoute,
  postDbAnalyzeRoute,
  postDbExplainRoute,
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
  .openapi(postDbExplainRoute, postDbExplainRouteHandler)
  .openapi(postDbAnalyzeRoute, postDbAnalyzeRouteHandler)
  .openapi(getClientRoute, getClientRouteHandler)
  .openapi(postClientAnalyzeRoute, postClientAnalyzeRouteHandler)
  .openapi(postClientCompleteRoute, postClientCompleteRouteHandler)
  .openapi(postClientCompleteDetailRoute, postClientCompleteDetailRouteHandler)
  .openapi(postClientHoverRoute, postClientHoverRouteHandler)
  .openapi(postClientSignatureRoute, postClientSignatureRouteHandler)
  .openapi(postClientCheckRoute, postClientCheckRouteHandler)
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
  .openapi(getDocsRoute, getDocsRouteHandler)

export default app
