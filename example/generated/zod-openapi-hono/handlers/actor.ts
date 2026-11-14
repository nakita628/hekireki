import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getActorsRoute,
  postActorsRoute,
  getActorsIdRoute,
  patchActorsIdRoute,
  deleteActorsIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getActorsRouteHandler: RouteHandler<typeof getActorsRoute> = async (c) => {
  const rows = await prisma.actor.findMany()
  return c.json(rows, 200)
}

export const postActorsRouteHandler: RouteHandler<typeof postActorsRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.actor.create({ data })
  return c.json(row, 201)
}

export const getActorsIdRouteHandler: RouteHandler<typeof getActorsIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const row = await prisma.actor.findFirst({ where: { id: data.id } })
  if (row === null) return c.body(null, 404)
  return c.json(row, 200)
}

export const patchActorsIdRouteHandler: RouteHandler<typeof patchActorsIdRoute> = async (c) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  const { count } = await prisma.actor.updateMany({ where: { id: data.id }, data })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.actor.findFirstOrThrow({ where: { id: data.id } })
  return c.json(row, 200)
}

export const deleteActorsIdRouteHandler: RouteHandler<typeof deleteActorsIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const { count } = await prisma.actor.deleteMany({ where: { id: data.id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
