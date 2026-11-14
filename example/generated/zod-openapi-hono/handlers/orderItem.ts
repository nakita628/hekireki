import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getOrderItemsRoute,
  postOrderItemsRoute,
  getOrderItemsIdRoute,
  patchOrderItemsIdRoute,
  deleteOrderItemsIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getOrderItemsRouteHandler: RouteHandler<typeof getOrderItemsRoute> = async (c) => {
  const rows = await prisma.orderItem.findMany()
  return c.json(
    rows.map((row) => ({ ...row, id: Number(row.id), orderId: Number(row.orderId) })),
    200,
  )
}

export const postOrderItemsRouteHandler: RouteHandler<typeof postOrderItemsRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.orderItem.create({ data })
  return c.json({ ...row, id: Number(row.id), orderId: Number(row.orderId) }, 201)
}

export const getOrderItemsIdRouteHandler: RouteHandler<typeof getOrderItemsIdRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const row = await prisma.orderItem.findFirst({ where: { id } })
  if (row === null) return c.body(null, 404)
  return c.json({ ...row, id: Number(row.id), orderId: Number(row.orderId) }, 200)
}

export const patchOrderItemsIdRouteHandler: RouteHandler<typeof patchOrderItemsIdRoute> = async (
  c,
) => {
  const { id } = c.req.valid('param')
  const data = c.req.valid('json')
  const { count } = await prisma.orderItem.updateMany({ where: { id }, data })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.orderItem.findFirstOrThrow({ where: { id } })
  return c.json({ ...row, id: Number(row.id), orderId: Number(row.orderId) }, 200)
}

export const deleteOrderItemsIdRouteHandler: RouteHandler<typeof deleteOrderItemsIdRoute> = async (
  c,
) => {
  const { id } = c.req.valid('param')
  const { count } = await prisma.orderItem.deleteMany({ where: { id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
