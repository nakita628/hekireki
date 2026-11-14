import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getCategoriesRoute,
  postCategoriesRoute,
  getCategoriesIdRoute,
  patchCategoriesIdRoute,
  deleteCategoriesIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getCategoriesRouteHandler: RouteHandler<typeof getCategoriesRoute> = async (c) => {
  const rows = await prisma.category.findMany()
  return c.json(rows, 200)
}

export const postCategoriesRouteHandler: RouteHandler<typeof postCategoriesRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.category.create({ data })
  return c.json(row, 201)
}

export const getCategoriesIdRouteHandler: RouteHandler<typeof getCategoriesIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const row = await prisma.category.findFirst({ where: { id: data.id } })
  if (row === null) return c.body(null, 404)
  return c.json(row, 200)
}

export const patchCategoriesIdRouteHandler: RouteHandler<typeof patchCategoriesIdRoute> = async (
  c,
) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  const { count } = await prisma.category.updateMany({ where: { id: data.id }, data })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.category.findFirstOrThrow({ where: { id: data.id } })
  return c.json(row, 200)
}

export const deleteCategoriesIdRouteHandler: RouteHandler<typeof deleteCategoriesIdRoute> = async (
  c,
) => {
  const data = c.req.valid('param')
  const { count } = await prisma.category.deleteMany({ where: { id: data.id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
