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
import { relations, sql } from 'drizzle-orm'

export const organizations = mysqlTable('organizations', {
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

export const users = mysqlTable(
  'users',
  {
    id: int('id').primaryKey().autoincrement(),
    organizationId: int('organization_id')
      .notNull()
      .references(() => organizations.id),
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

export const roles = mysqlTable('roles', {
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

export const permissions = mysqlTable(
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

export const userRoles = mysqlTable(
  'user_roles',
  {
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
    roleId: int('role_id')
      .notNull()
      .references(() => roles.id),
    assignedAt: datetime('assigned_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
)

export const rolePermissions = mysqlTable(
  'role_permissions',
  {
    roleId: int('role_id')
      .notNull()
      .references(() => roles.id),
    permissionId: int('permission_id')
      .notNull()
      .references(() => permissions.id),
    assignedAt: datetime('assigned_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
)

export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
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

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  userRoles: many(userRoles),
  auditLogs: many(auditLogs),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
}))

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}))

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}))
