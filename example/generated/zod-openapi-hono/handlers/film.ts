import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getFilmsRoute,
  postFilmsRoute,
  getFilmsIdRoute,
  patchFilmsIdRoute,
  deleteFilmsIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getFilmsRouteHandler: RouteHandler<typeof getFilmsRoute> = async (c) => {
  const rows = await prisma.film.findMany()
  return c.json(rows, 200)
}

export const postFilmsRouteHandler: RouteHandler<typeof postFilmsRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.film.create({ data })
  return c.json(row, 201)
}

export const getFilmsIdRouteHandler: RouteHandler<typeof getFilmsIdRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const row = await prisma.film.findFirst({ where: { id } })
  if (row === null) return c.body(null, 404)
  return c.json(row, 200)
}

export const patchFilmsIdRouteHandler: RouteHandler<typeof patchFilmsIdRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const data = c.req.valid('json')
  const { count } = await prisma.film.updateMany({ where: { id }, data })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.film.findFirstOrThrow({ where: { id } })
  return c.json(row, 200)
}

export const deleteFilmsIdRouteHandler: RouteHandler<typeof deleteFilmsIdRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const { count } = await prisma.film.deleteMany({ where: { id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
