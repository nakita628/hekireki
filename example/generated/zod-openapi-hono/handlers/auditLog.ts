import type { RouteHandler } from '@hono/zod-openapi'
import type {
  getAuditLogsRoute,
  postAuditLogsRoute,
  getAuditLogsIdRoute,
  patchAuditLogsIdRoute,
  deleteAuditLogsIdRoute,
} from '../routes'
import { prisma } from '../prisma'

export const getAuditLogsRouteHandler: RouteHandler<typeof getAuditLogsRoute> = async (c) => {
  const { limit, offset } = c.req.valid('query')
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ take: limit, skip: offset, orderBy: [{ id: 'asc' }] }),
    prisma.auditLog.count(),
  ])
  return c.json(
    rows.map((row) => ({
      ...row,
      signature: row.signature === null ? null : Buffer.from(row.signature).toString('base64'),
    })),
    200,
    { 'X-Total-Count': String(total) },
  )
}

export const postAuditLogsRouteHandler: RouteHandler<typeof postAuditLogsRoute> = async (c) => {
  const data = c.req.valid('json')
  const row = await prisma.auditLog.create({
    data: {
      ...data,
      signature:
        data.signature === undefined
          ? undefined
          : data.signature === null
            ? null
            : new Uint8Array(Buffer.from(data.signature, 'base64')),
    },
  })
  return c.json(
    {
      ...row,
      signature: row.signature === null ? null : Buffer.from(row.signature).toString('base64'),
    },
    201,
  )
}

export const getAuditLogsIdRouteHandler: RouteHandler<typeof getAuditLogsIdRoute> = async (c) => {
  const data = c.req.valid('param')
  const row = await prisma.auditLog.findFirst({ where: { id: data.id } })
  if (row === null) return c.body(null, 404)
  return c.json(
    {
      ...row,
      signature: row.signature === null ? null : Buffer.from(row.signature).toString('base64'),
    },
    200,
  )
}

export const patchAuditLogsIdRouteHandler: RouteHandler<typeof patchAuditLogsIdRoute> = async (
  c,
) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  const { count } = await prisma.auditLog.updateMany({
    where: { id: data.id },
    data: {
      ...data,
      signature:
        data.signature === undefined
          ? undefined
          : data.signature === null
            ? null
            : new Uint8Array(Buffer.from(data.signature, 'base64')),
    },
  })
  if (count === 0) return c.body(null, 404)
  const row = await prisma.auditLog.findFirstOrThrow({ where: { id: data.id } })
  return c.json(
    {
      ...row,
      signature: row.signature === null ? null : Buffer.from(row.signature).toString('base64'),
    },
    200,
  )
}

export const deleteAuditLogsIdRouteHandler: RouteHandler<typeof deleteAuditLogsIdRoute> = async (
  c,
) => {
  const data = c.req.valid('param')
  const { count } = await prisma.auditLog.deleteMany({ where: { id: data.id } })
  if (count === 0) return c.body(null, 404)
  return c.body(null, 204)
}
