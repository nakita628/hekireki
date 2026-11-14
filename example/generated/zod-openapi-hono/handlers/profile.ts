import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getProfilesRoute,
  postProfilesRoute,
  getProfilesIdRoute,
  patchProfilesIdRoute,
  deleteProfilesIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getProfilesRouteHandler: RouteHandler<typeof getProfilesRoute> = async (c) => {
  const rows = await prisma.profile.findMany()
  return c.json(
    rows.map((row) => ({
      ...row,
      avatar: row.avatar === null ? null : Buffer.from(row.avatar).toString('base64'),
    })),
    200,
  )
}

export const postProfilesRouteHandler: RouteHandler<typeof postProfilesRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.profile.create({
    data: {
      ...data,
      avatar:
        data.avatar === undefined
          ? undefined
          : data.avatar === null
            ? null
            : new Uint8Array(Buffer.from(data.avatar, 'base64')),
    },
  })
  return c.json(
    { ...row, avatar: row.avatar === null ? null : Buffer.from(row.avatar).toString('base64') },
    201,
  )
}

export const getProfilesIdRouteHandler: RouteHandler<typeof getProfilesIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const row = await prisma.profile.findFirst({ where: { id: data.id } })
  if (row === null) return c.body(null, 404)
  return c.json(
    { ...row, avatar: row.avatar === null ? null : Buffer.from(row.avatar).toString('base64') },
    200,
  )
}

export const patchProfilesIdRouteHandler: RouteHandler<typeof patchProfilesIdRoute> = async (c) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  const { count } = await prisma.profile.updateMany({
    where: { id: data.id },
    data: {
      ...data,
      avatar:
        data.avatar === undefined
          ? undefined
          : data.avatar === null
            ? null
            : new Uint8Array(Buffer.from(data.avatar, 'base64')),
    },
  })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.profile.findFirstOrThrow({ where: { id: data.id } })
  return c.json(
    { ...row, avatar: row.avatar === null ? null : Buffer.from(row.avatar).toString('base64') },
    200,
  )
}

export const deleteProfilesIdRouteHandler: RouteHandler<typeof deleteProfilesIdRoute> = async (
  c,
) => {
  const data = c.req.valid('param')
  const { count } = await prisma.profile.deleteMany({ where: { id: data.id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
