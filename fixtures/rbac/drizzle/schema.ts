import { relations, sql } from 'drizzle-orm'
import {
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core'

export const organization = mysqlTable('organizations', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  status: mysqlEnum('status', ['ACTIVE', 'INACTIVE', 'SUSPENDED']).notNull().default('ACTIVE'),
  createdAt: datetime('created_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime('updated_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date()),
})

export const user = mysqlTable(
  'users',
  {
    id: int('id').primaryKey().autoincrement(),
    organizationId: int('organization_id')
      .notNull()
      .references(() => organization.id),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: datetime('created_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime('updated_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [index('idx_users_organizationId').on(table.organizationId)],
)

export const role = mysqlTable('roles', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: varchar('description', { length: 500 }),
  createdAt: datetime('created_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime('updated_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date()),
})

export const permission = mysqlTable(
  'permissions',
  {
    id: int('id').primaryKey().autoincrement(),
    resource: varchar('resource', { length: 100 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }),
    createdAt: datetime('created_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [unique().on(table.resource, table.action)],
)

export const userRole = mysqlTable(
  'user_roles',
  {
    userId: int('user_id')
      .notNull()
      .references(() => user.id),
    roleId: int('role_id')
      .notNull()
      .references(() => role.id),
    assignedAt: datetime('assigned_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
)

export const rolePermission = mysqlTable(
  'role_permissions',
  {
    roleId: int('role_id')
      .notNull()
      .references(() => role.id),
    permissionId: int('permission_id')
      .notNull()
      .references(() => permission.id),
    assignedAt: datetime('assigned_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
)

export const auditLog = mysqlTable(
  'audit_logs',
  {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id')
      .notNull()
      .references(() => user.id),
    action: varchar('action', { length: 50 }).notNull(),
    resource: varchar('resource', { length: 100 }).notNull(),
    detail: text('detail'),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: datetime('created_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    index('idx_audit_logs_userId').on(table.userId),
    index('idx_audit_logs_createdAt').on(table.createdAt),
  ],
)

export const organizationRelations = relations(organization, ({ many }) => ({ users: many(user) }))

export const userRelations = relations(user, ({ one, many }) => ({
  organization: one(organization, { fields: [user.organizationId], references: [organization.id] }),
  userRoles: many(userRole),
  auditLogs: many(auditLog),
}))

export const roleRelations = relations(role, ({ many }) => ({
  userRoles: many(userRole),
  rolePermissions: many(rolePermission),
}))

export const permissionRelations = relations(permission, ({ many }) => ({
  rolePermissions: many(rolePermission),
}))

export const userRoleRelations = relations(userRole, ({ one }) => ({
  user: one(user, { fields: [userRole.userId], references: [user.id] }),
  role: one(role, { fields: [userRole.roleId], references: [role.id] }),
}))

export const rolePermissionRelations = relations(rolePermission, ({ one }) => ({
  role: one(role, { fields: [rolePermission.roleId], references: [role.id] }),
  permission: one(permission, {
    fields: [rolePermission.permissionId],
    references: [permission.id],
  }),
}))

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(user, { fields: [auditLog.userId], references: [user.id] }),
}))
