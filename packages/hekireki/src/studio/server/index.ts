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
  postPrismaCompleteRouteHandler,
  postPrismaFormatRouteHandler,
  postPrismaLintRouteHandler,
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
  postPrismaCompleteRoute,
  postPrismaFormatRoute,
  postPrismaLintRoute,
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
  .openapi(postPrismaCompleteRoute, postPrismaCompleteRouteHandler)
  .openapi(getDocsRoute, getDocsRouteHandler)

export default app
