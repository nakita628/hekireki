import { type Static, Type } from '@sinclair/typebox'

export const OrganizationSchema = Type.Object({
  /**
   * Organization ID
   */
  id: Type.Integer(),
  /**
   * Organization name
   */
  name: Type.String(),
  /**
   * URL-safe slug
   */
  slug: Type.String(),
  /**
   * Organization status
   */
  status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('INACTIVE'), Type.Literal('SUSPENDED')]),
  /**
   * Creation timestamp
   */
  createdAt: Type.Date(),
  /**
   * Last update timestamp
   */
  updatedAt: Type.Date(),
})

export type Organization = Static<typeof OrganizationSchema>

export const UserSchema = Type.Object({
  /**
   * User ID
   */
  id: Type.Integer(),
  /**
   * Organization ID
   */
  organizationId: Type.Integer(),
  /**
   * Email address
   */
  email: Type.String(),
  /**
   * Display name
   */
  name: Type.String(),
  /**
   * Creation timestamp
   */
  createdAt: Type.Date(),
  /**
   * Last update timestamp
   */
  updatedAt: Type.Date(),
})

export type User = Static<typeof UserSchema>

export const RoleSchema = Type.Object({
  /**
   * Role ID
   */
  id: Type.Integer(),
  /**
   * Role name
   */
  name: Type.String(),
  /**
   * Role description
   */
  description: Type.Optional(Type.String()),
  /**
   * Creation timestamp
   */
  createdAt: Type.Date(),
  /**
   * Last update timestamp
   */
  updatedAt: Type.Date(),
})

export type Role = Static<typeof RoleSchema>

export const PermissionSchema = Type.Object({
  /**
   * Permission ID
   */
  id: Type.Integer(),
  /**
   * Resource name
   */
  resource: Type.String(),
  /**
   * Action name
   */
  action: Type.String(),
  /**
   * Permission description
   */
  description: Type.Optional(Type.String()),
  /**
   * Creation timestamp
   */
  createdAt: Type.Date(),
})

export type Permission = Static<typeof PermissionSchema>

export const UserRoleSchema = Type.Object({
  /**
   * User ID
   */
  userId: Type.Integer(),
  /**
   * Role ID
   */
  roleId: Type.Integer(),
  /**
   * Assignment timestamp
   */
  assignedAt: Type.Date(),
})

export type UserRole = Static<typeof UserRoleSchema>

export const RolePermissionSchema = Type.Object({
  /**
   * Role ID
   */
  roleId: Type.Integer(),
  /**
   * Permission ID
   */
  permissionId: Type.Integer(),
  /**
   * Assignment timestamp
   */
  assignedAt: Type.Date(),
})

export type RolePermission = Static<typeof RolePermissionSchema>

export const AuditLogSchema = Type.Object({
  /**
   * Audit log ID
   */
  id: Type.Integer(),
  /**
   * User ID
   */
  userId: Type.Integer(),
  /**
   * Action performed
   */
  action: Type.String(),
  /**
   * Resource name
   */
  resource: Type.String(),
  /**
   * Action detail
   */
  detail: Type.Optional(Type.String()),
  /**
   * Client IP address
   */
  ipAddress: Type.Optional(Type.String()),
  /**
   * Action timestamp
   */
  createdAt: Type.Date(),
})

export type AuditLog = Static<typeof AuditLogSchema>

export const OrganizationRelationsSchema = Type.Object({
  ...OrganizationSchema.properties,
  users: Type.Array(UserSchema),
})

export type OrganizationRelations = Static<typeof OrganizationRelationsSchema>

export const UserRelationsSchema = Type.Object({
  ...UserSchema.properties,
  organization: OrganizationSchema,
  userRoles: Type.Array(UserRoleSchema),
  auditLogs: Type.Array(AuditLogSchema),
})

export type UserRelations = Static<typeof UserRelationsSchema>

export const RoleRelationsSchema = Type.Object({
  ...RoleSchema.properties,
  userRoles: Type.Array(UserRoleSchema),
  rolePermissions: Type.Array(RolePermissionSchema),
})

export type RoleRelations = Static<typeof RoleRelationsSchema>

export const PermissionRelationsSchema = Type.Object({
  ...PermissionSchema.properties,
  rolePermissions: Type.Array(RolePermissionSchema),
})

export type PermissionRelations = Static<typeof PermissionRelationsSchema>

export const UserRoleRelationsSchema = Type.Object({
  ...UserRoleSchema.properties,
  user: UserSchema,
  role: RoleSchema,
})

export type UserRoleRelations = Static<typeof UserRoleRelationsSchema>

export const RolePermissionRelationsSchema = Type.Object({
  ...RolePermissionSchema.properties,
  role: RoleSchema,
  permission: PermissionSchema,
})

export type RolePermissionRelations = Static<typeof RolePermissionRelationsSchema>

export const AuditLogRelationsSchema = Type.Object({
  ...AuditLogSchema.properties,
  user: UserSchema,
})

export type AuditLogRelations = Static<typeof AuditLogRelationsSchema>
