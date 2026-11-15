import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getFollowsRoute,
  postFollowsRoute,
  getFollowsFollowerIdFollowingIdRoute,
  patchFollowsFollowerIdFollowingIdRoute,
  deleteFollowsFollowerIdFollowingIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getFollowsRouteHandler: RouteHandler<typeof getFollowsRoute> = async (c) => {
  const { limit, offset } = c.req.valid('query')
  const [rows, total] = await Promise.all([
    prisma.follow.findMany({
      take: limit,
      skip: offset,
      orderBy: [{ followerId: 'asc' }, { followingId: 'asc' }],
    }),
    prisma.follow.count(),
  ])
  return c.json(rows, 200, { 'X-Total-Count': String(total) })
}

export const postFollowsRouteHandler: RouteHandler<typeof postFollowsRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.follow.create({ data })
  return c.json(row, 201)
}

export const getFollowsFollowerIdFollowingIdRouteHandler: RouteHandler<
  typeof getFollowsFollowerIdFollowingIdRoute
> = async (c) => {
  const data = c.req.valid('param')
  const row = await prisma.follow.findFirst({
    where: { followerId: data.followerId, followingId: data.followingId },
  })
  if (row === null) return c.body(null, 404)
  return c.json(row, 200)
}

export const patchFollowsFollowerIdFollowingIdRouteHandler: RouteHandler<
  typeof patchFollowsFollowerIdFollowingIdRoute
> = async (c) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  const { count } = await prisma.follow.updateMany({
    where: { followerId: data.followerId, followingId: data.followingId },
    data,
  })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.follow.findFirstOrThrow({
    where: { followerId: data.followerId, followingId: data.followingId },
  })
  return c.json(row, 200)
}

export const deleteFollowsFollowerIdFollowingIdRouteHandler: RouteHandler<
  typeof deleteFollowsFollowerIdFollowingIdRoute
> = async (c) => {
  const data = c.req.valid('param')
  const { count } = await prisma.follow.deleteMany({
    where: { followerId: data.followerId, followingId: data.followingId },
  })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
