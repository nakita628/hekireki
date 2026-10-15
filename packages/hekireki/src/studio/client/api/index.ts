import { hc } from 'hono/client'
import type { schema, db, client, prisma, migrate, docs } from '../../server/index'

type SchemaClient = ReturnType<typeof hc<typeof schema>>

const hcSchemaWithType = (...args: Parameters<typeof hc>): SchemaClient =>
  hc<typeof schema>(...args)

export const schemaClient = hcSchemaWithType('/').api

type DbClient = ReturnType<typeof hc<typeof db>>

const hcDbWithType = (...args: Parameters<typeof hc>): DbClient => hc<typeof db>(...args)

export const dbClient = hcDbWithType('/').api

type ClientClient = ReturnType<typeof hc<typeof client>>

const hcClientWithType = (...args: Parameters<typeof hc>): ClientClient =>
  hc<typeof client>(...args)

export const clientClient = hcClientWithType('/').api

type PrismaClient = ReturnType<typeof hc<typeof prisma>>

const hcPrismaWithType = (...args: Parameters<typeof hc>): PrismaClient =>
  hc<typeof prisma>(...args)

export const prismaClient = hcPrismaWithType('/').api

type MigrateClient = ReturnType<typeof hc<typeof migrate>>

const hcMigrateWithType = (...args: Parameters<typeof hc>): MigrateClient =>
  hc<typeof migrate>(...args)

export const migrateClient = hcMigrateWithType('/').api

type DocsClient = ReturnType<typeof hc<typeof docs>>

const hcDocsWithType = (...args: Parameters<typeof hc>): DocsClient => hc<typeof docs>(...args)

export const docsClient = hcDocsWithType('/').api
