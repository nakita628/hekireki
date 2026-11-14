import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getUsersRoute,
  postUsersRoute,
  getUsersIdRoute,
  patchUsersIdRoute,
  deleteUsersIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getUsersRouteHandler: RouteHandler<typeof getUsersRoute> = async (c) => {
  const rows = await prisma.user.findMany()
  return c.json(rows, 200)
}

export const postUsersRouteHandler: RouteHandler<typeof postUsersRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.user.create({ data })
  return c.json(row, 201)
}

export const getUsersIdRouteHandler: RouteHandler<typeof getUsersIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const row = await prisma.user.findFirst({ where: { id: data.id } })
  if (row === null) return c.body(null, 404)
  return c.json(row, 200)
}

export const patchUsersIdRouteHandler: RouteHandler<typeof patchUsersIdRoute> = async (c) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  const { count } = await prisma.user.updateMany({ where: { id: data.id }, data })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.user.findFirstOrThrow({ where: { id: data.id } })
  return c.json(row, 200)
}

export const deleteUsersIdRouteHandler: RouteHandler<typeof deleteUsersIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const { count } = await prisma.user.deleteMany({ where: { id: data.id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
