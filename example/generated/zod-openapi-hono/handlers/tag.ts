import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getTagsRoute,
  postTagsRoute,
  getTagsIdRoute,
  patchTagsIdRoute,
  deleteTagsIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getTagsRouteHandler: RouteHandler<typeof getTagsRoute> = async (c) => {
  const rows = await prisma.tag.findMany()
  return c.json(rows, 200)
}

export const postTagsRouteHandler: RouteHandler<typeof postTagsRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.tag.create({ data })
  return c.json(row, 201)
}

export const getTagsIdRouteHandler: RouteHandler<typeof getTagsIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const row = await prisma.tag.findFirst({ where: { id: data.id } })
  if (row === null) return c.body(null, 404)
  return c.json(row, 200)
}

export const patchTagsIdRouteHandler: RouteHandler<typeof patchTagsIdRoute> = async (c) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  const { count } = await prisma.tag.updateMany({ where: { id: data.id }, data })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.tag.findFirstOrThrow({ where: { id: data.id } })
  return c.json(row, 200)
}

export const deleteTagsIdRouteHandler: RouteHandler<typeof deleteTagsIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const { count } = await prisma.tag.deleteMany({ where: { id: data.id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
