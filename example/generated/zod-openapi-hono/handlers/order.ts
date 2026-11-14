import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getOrdersRoute,
  postOrdersRoute,
  getOrdersIdRoute,
  patchOrdersIdRoute,
  deleteOrdersIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getOrdersRouteHandler: RouteHandler<typeof getOrdersRoute> = async (c) => {
  const rows = await prisma.order.findMany()
  return c.json(
    rows.map((row) => ({ ...row, id: Number(row.id) })),
    200,
  )
}

export const postOrdersRouteHandler: RouteHandler<typeof postOrdersRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.order.create({ data })
  return c.json({ ...row, id: Number(row.id) }, 201)
}

export const getOrdersIdRouteHandler: RouteHandler<typeof getOrdersIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const row = await prisma.order.findFirst({ where: { id: data.id } })
  if (row === null) return c.body(null, 404)
  return c.json({ ...row, id: Number(row.id) }, 200)
}

export const patchOrdersIdRouteHandler: RouteHandler<typeof patchOrdersIdRoute> = async (c) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  const { count } = await prisma.order.updateMany({ where: { id: data.id }, data })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.order.findFirstOrThrow({ where: { id: data.id } })
  return c.json({ ...row, id: Number(row.id) }, 200)
}

export const deleteOrdersIdRouteHandler: RouteHandler<typeof deleteOrdersIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const { count } = await prisma.order.deleteMany({ where: { id: data.id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
