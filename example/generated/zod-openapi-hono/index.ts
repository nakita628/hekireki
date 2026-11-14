import { OpenAPIHono } from '@hono/zod-openapi'
import {
  getUsersRoute,
  postUsersRoute,
  getUsersIdRoute,
  patchUsersIdRoute,
  deleteUsersIdRoute,
  getProfilesRoute,
  postProfilesRoute,
  getProfilesIdRoute,
  patchProfilesIdRoute,
  deleteProfilesIdRoute,
  getPostsRoute,
  postPostsRoute,
  getPostsIdRoute,
  patchPostsIdRoute,
  deletePostsIdRoute,
  getTagsRoute,
  postTagsRoute,
  getTagsIdRoute,
  patchTagsIdRoute,
  deleteTagsIdRoute,
  getCommentsRoute,
  postCommentsRoute,
  getCommentsIdRoute,
  patchCommentsIdRoute,
  deleteCommentsIdRoute,
  getFollowsRoute,
  postFollowsRoute,
  getFollowsFollowerIdFollowingIdRoute,
  patchFollowsFollowerIdFollowingIdRoute,
  deleteFollowsFollowerIdFollowingIdRoute,
  getCategoriesRoute,
  postCategoriesRoute,
  getCategoriesIdRoute,
  patchCategoriesIdRoute,
  deleteCategoriesIdRoute,
  getOrdersRoute,
  postOrdersRoute,
  getOrdersIdRoute,
  patchOrdersIdRoute,
  deleteOrdersIdRoute,
  getOrderItemsRoute,
  postOrderItemsRoute,
  getOrderItemsIdRoute,
  patchOrderItemsIdRoute,
  deleteOrderItemsIdRoute,
  getAuditLogsRoute,
  postAuditLogsRoute,
  getAuditLogsIdRoute,
  patchAuditLogsIdRoute,
  deleteAuditLogsIdRoute,
  getActorsRoute,
  postActorsRoute,
  getActorsIdRoute,
  patchActorsIdRoute,
  deleteActorsIdRoute,
  getFilmsRoute,
  postFilmsRoute,
  getFilmsIdRoute,
  patchFilmsIdRoute,
  deleteFilmsIdRoute,
} from './routes'
import {
  getUsersRouteHandler,
  postUsersRouteHandler,
  getUsersIdRouteHandler,
  patchUsersIdRouteHandler,
  deleteUsersIdRouteHandler,
  getProfilesRouteHandler,
  postProfilesRouteHandler,
  getProfilesIdRouteHandler,
  patchProfilesIdRouteHandler,
  deleteProfilesIdRouteHandler,
  getPostsRouteHandler,
  postPostsRouteHandler,
  getPostsIdRouteHandler,
  patchPostsIdRouteHandler,
  deletePostsIdRouteHandler,
  getTagsRouteHandler,
  postTagsRouteHandler,
  getTagsIdRouteHandler,
  patchTagsIdRouteHandler,
  deleteTagsIdRouteHandler,
  getCommentsRouteHandler,
  postCommentsRouteHandler,
  getCommentsIdRouteHandler,
  patchCommentsIdRouteHandler,
  deleteCommentsIdRouteHandler,
  getFollowsRouteHandler,
  postFollowsRouteHandler,
  getFollowsFollowerIdFollowingIdRouteHandler,
  patchFollowsFollowerIdFollowingIdRouteHandler,
  deleteFollowsFollowerIdFollowingIdRouteHandler,
  getCategoriesRouteHandler,
  postCategoriesRouteHandler,
  getCategoriesIdRouteHandler,
  patchCategoriesIdRouteHandler,
  deleteCategoriesIdRouteHandler,
  getOrdersRouteHandler,
  postOrdersRouteHandler,
  getOrdersIdRouteHandler,
  patchOrdersIdRouteHandler,
  deleteOrdersIdRouteHandler,
  getOrderItemsRouteHandler,
  postOrderItemsRouteHandler,
  getOrderItemsIdRouteHandler,
  patchOrderItemsIdRouteHandler,
  deleteOrderItemsIdRouteHandler,
  getAuditLogsRouteHandler,
  postAuditLogsRouteHandler,
  getAuditLogsIdRouteHandler,
  patchAuditLogsIdRouteHandler,
  deleteAuditLogsIdRouteHandler,
  getActorsRouteHandler,
  postActorsRouteHandler,
  getActorsIdRouteHandler,
  patchActorsIdRouteHandler,
  deleteActorsIdRouteHandler,
  getFilmsRouteHandler,
  postFilmsRouteHandler,
  getFilmsIdRouteHandler,
  patchFilmsIdRouteHandler,
  deleteFilmsIdRouteHandler,
} from './handlers'
import { auth } from './auth'

const app = new OpenAPIHono()

app.use('/users/*', auth)
app.use('/profiles/*', auth)
app.use('/posts/*', auth)
app.use('/tags/*', auth)
app.use('/comments/*', auth)
app.use('/follows/*', auth)
app.use('/categories/*', auth)
app.use('/orders/*', auth)
app.use('/order-items/*', auth)
app.use('/audit-logs/*', auth)
app.use('/actors/*', auth)
app.use('/films/*', auth)

export const api = app
  .openapi(getUsersRoute, getUsersRouteHandler)
  .openapi(postUsersRoute, postUsersRouteHandler)
  .openapi(getUsersIdRoute, getUsersIdRouteHandler)
  .openapi(patchUsersIdRoute, patchUsersIdRouteHandler)
  .openapi(deleteUsersIdRoute, deleteUsersIdRouteHandler)
  .openapi(getProfilesRoute, getProfilesRouteHandler)
  .openapi(postProfilesRoute, postProfilesRouteHandler)
  .openapi(getProfilesIdRoute, getProfilesIdRouteHandler)
  .openapi(patchProfilesIdRoute, patchProfilesIdRouteHandler)
  .openapi(deleteProfilesIdRoute, deleteProfilesIdRouteHandler)
  .openapi(getPostsRoute, getPostsRouteHandler)
  .openapi(postPostsRoute, postPostsRouteHandler)
  .openapi(getPostsIdRoute, getPostsIdRouteHandler)
  .openapi(patchPostsIdRoute, patchPostsIdRouteHandler)
  .openapi(deletePostsIdRoute, deletePostsIdRouteHandler)
  .openapi(getTagsRoute, getTagsRouteHandler)
  .openapi(postTagsRoute, postTagsRouteHandler)
  .openapi(getTagsIdRoute, getTagsIdRouteHandler)
  .openapi(patchTagsIdRoute, patchTagsIdRouteHandler)
  .openapi(deleteTagsIdRoute, deleteTagsIdRouteHandler)
  .openapi(getCommentsRoute, getCommentsRouteHandler)
  .openapi(postCommentsRoute, postCommentsRouteHandler)
  .openapi(getCommentsIdRoute, getCommentsIdRouteHandler)
  .openapi(patchCommentsIdRoute, patchCommentsIdRouteHandler)
  .openapi(deleteCommentsIdRoute, deleteCommentsIdRouteHandler)
  .openapi(getFollowsRoute, getFollowsRouteHandler)
  .openapi(postFollowsRoute, postFollowsRouteHandler)
  .openapi(getFollowsFollowerIdFollowingIdRoute, getFollowsFollowerIdFollowingIdRouteHandler)
  .openapi(patchFollowsFollowerIdFollowingIdRoute, patchFollowsFollowerIdFollowingIdRouteHandler)
  .openapi(deleteFollowsFollowerIdFollowingIdRoute, deleteFollowsFollowerIdFollowingIdRouteHandler)
  .openapi(getCategoriesRoute, getCategoriesRouteHandler)
  .openapi(postCategoriesRoute, postCategoriesRouteHandler)
  .openapi(getCategoriesIdRoute, getCategoriesIdRouteHandler)
  .openapi(patchCategoriesIdRoute, patchCategoriesIdRouteHandler)
  .openapi(deleteCategoriesIdRoute, deleteCategoriesIdRouteHandler)
  .openapi(getOrdersRoute, getOrdersRouteHandler)
  .openapi(postOrdersRoute, postOrdersRouteHandler)
  .openapi(getOrdersIdRoute, getOrdersIdRouteHandler)
  .openapi(patchOrdersIdRoute, patchOrdersIdRouteHandler)
  .openapi(deleteOrdersIdRoute, deleteOrdersIdRouteHandler)
  .openapi(getOrderItemsRoute, getOrderItemsRouteHandler)
  .openapi(postOrderItemsRoute, postOrderItemsRouteHandler)
  .openapi(getOrderItemsIdRoute, getOrderItemsIdRouteHandler)
  .openapi(patchOrderItemsIdRoute, patchOrderItemsIdRouteHandler)
  .openapi(deleteOrderItemsIdRoute, deleteOrderItemsIdRouteHandler)
  .openapi(getAuditLogsRoute, getAuditLogsRouteHandler)
  .openapi(postAuditLogsRoute, postAuditLogsRouteHandler)
  .openapi(getAuditLogsIdRoute, getAuditLogsIdRouteHandler)
  .openapi(patchAuditLogsIdRoute, patchAuditLogsIdRouteHandler)
  .openapi(deleteAuditLogsIdRoute, deleteAuditLogsIdRouteHandler)
  .openapi(getActorsRoute, getActorsRouteHandler)
  .openapi(postActorsRoute, postActorsRouteHandler)
  .openapi(getActorsIdRoute, getActorsIdRouteHandler)
  .openapi(patchActorsIdRoute, patchActorsIdRouteHandler)
  .openapi(deleteActorsIdRoute, deleteActorsIdRouteHandler)
  .openapi(getFilmsRoute, getFilmsRouteHandler)
  .openapi(postFilmsRoute, postFilmsRouteHandler)
  .openapi(getFilmsIdRoute, getFilmsIdRouteHandler)
  .openapi(patchFilmsIdRoute, patchFilmsIdRouteHandler)
  .openapi(deleteFilmsIdRoute, deleteFilmsIdRouteHandler)

export default app
