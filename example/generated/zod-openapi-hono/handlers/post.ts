import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getPostsRoute,
  postPostsRoute,
  getPostsIdRoute,
  patchPostsIdRoute,
  deletePostsIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getPostsRouteHandler: RouteHandler<typeof getPostsRoute> = async (c) => {
  const rows = await prisma.post.findMany()
  return c.json(rows, 200)
}

export const postPostsRouteHandler: RouteHandler<typeof postPostsRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.post.create({ data })
  return c.json(row, 201)
}

export const getPostsIdRouteHandler: RouteHandler<typeof getPostsIdRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const row = await prisma.post.findFirst({ where: { id } })
  if (row === null) return c.body(null, 404)
  return c.json(row, 200)
}

export const patchPostsIdRouteHandler: RouteHandler<typeof patchPostsIdRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const data = c.req.valid('json')
  const { count } = await prisma.post.updateMany({ where: { id }, data })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.post.findFirstOrThrow({ where: { id } })
  return c.json(row, 200)
}

export const deletePostsIdRouteHandler: RouteHandler<typeof deletePostsIdRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const { count } = await prisma.post.deleteMany({ where: { id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
