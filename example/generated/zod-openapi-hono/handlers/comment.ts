import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getCommentsRoute,
  postCommentsRoute,
  getCommentsIdRoute,
  patchCommentsIdRoute,
  deleteCommentsIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getCommentsRouteHandler: RouteHandler<typeof getCommentsRoute> = async (c) => {
  const rows = await prisma.comment.findMany()
  return c.json(rows, 200)
}

export const postCommentsRouteHandler: RouteHandler<typeof postCommentsRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.comment.create({ data })
  return c.json(row, 201)
}

export const getCommentsIdRouteHandler: RouteHandler<typeof getCommentsIdRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const row = await prisma.comment.findFirst({ where: { id } })
  if (row === null) return c.body(null, 404)
  return c.json(row, 200)
}

export const patchCommentsIdRouteHandler: RouteHandler<typeof patchCommentsIdRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const data = c.req.valid('json')
  const { count } = await prisma.comment.updateMany({ where: { id }, data })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.comment.findFirstOrThrow({ where: { id } })
  return c.json(row, 200)
}

export const deleteCommentsIdRouteHandler: RouteHandler<typeof deleteCommentsIdRoute> = async (
  c,
) => {
  const { id } = c.req.valid('param')
  const { count } = await prisma.comment.deleteMany({ where: { id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
