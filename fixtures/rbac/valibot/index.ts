import * as v from 'valibot'

export const OrganizationSchema = v.object({
  /**
   * Organization ID
   */
  id: v.pipe(v.number(), v.integer()),
  /**
   * Organization name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  /**
   * URL-safe slug
   */
  slug: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  /**
   * Organization status
   */
  status: v.picklist(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  /**
   * Creation timestamp
   */
  createdAt: v.date(),
  /**
   * Last update timestamp
   */
  updatedAt: v.date(),
})

export type Organization = v.InferOutput<typeof OrganizationSchema>

export const UserSchema = v.object({
  /**
   * User ID
   */
  id: v.pipe(v.number(), v.integer()),
  /**
   * Organization ID
   */
  organizationId: v.pipe(v.number(), v.integer()),
  /**
   * Email address
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  /**
   * Creation timestamp
   */
  createdAt: v.date(),
  /**
   * Last update timestamp
   */
  updatedAt: v.date(),
})

export type User = v.InferOutput<typeof UserSchema>

export const RoleSchema = v.object({
  /**
   * Role ID
   */
  id: v.pipe(v.number(), v.integer()),
  /**
   * Role name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  /**
   * Role description
   */
  description: v.exactOptional(v.nullish(v.string())),
  /**
   * Creation timestamp
   */
  createdAt: v.date(),
  /**
   * Last update timestamp
   */
  updatedAt: v.date(),
})

export type Role = v.InferOutput<typeof RoleSchema>

export const PermissionSchema = v.object({
  /**
   * Permission ID
   */
  id: v.pipe(v.number(), v.integer()),
  /**
   * Resource name
   */
  resource: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  /**
   * Action name
   */
  action: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  /**
   * Permission description
   */
  description: v.exactOptional(v.nullish(v.string())),
  /**
   * Creation timestamp
   */
  createdAt: v.date(),
})

export type Permission = v.InferOutput<typeof PermissionSchema>

export const UserRoleSchema = v.object({
  /**
   * User ID
   */
  userId: v.pipe(v.number(), v.integer()),
  /**
   * Role ID
   */
  roleId: v.pipe(v.number(), v.integer()),
  /**
   * Assignment timestamp
   */
  assignedAt: v.date(),
})

export type UserRole = v.InferOutput<typeof UserRoleSchema>

export const RolePermissionSchema = v.object({
  /**
   * Role ID
   */
  roleId: v.pipe(v.number(), v.integer()),
  /**
   * Permission ID
   */
  permissionId: v.pipe(v.number(), v.integer()),
  /**
   * Assignment timestamp
   */
  assignedAt: v.date(),
})

export type RolePermission = v.InferOutput<typeof RolePermissionSchema>

export const AuditLogSchema = v.object({
  /**
   * Audit log ID
   */
  id: v.pipe(v.number(), v.integer()),
  /**
   * User ID
   */
  userId: v.pipe(v.number(), v.integer()),
  /**
   * Action performed
   */
  action: v.string(),
  /**
   * Resource name
   */
  resource: v.string(),
  /**
   * Action detail
   */
  detail: v.exactOptional(v.nullish(v.string())),
  /**
   * Client IP address
   */
  ipAddress: v.exactOptional(v.nullish(v.string())),
  /**
   * Action timestamp
   */
  createdAt: v.date(),
})

export type AuditLog = v.InferOutput<typeof AuditLogSchema>

export const OrganizationRelationsSchema = v.object({
  ...OrganizationSchema.entries,
  users: v.array(UserSchema),
})

export type OrganizationRelations = v.InferOutput<typeof OrganizationRelationsSchema>

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  organization: OrganizationSchema,
  userRoles: v.array(UserRoleSchema),
  auditLogs: v.array(AuditLogSchema),
})

export type UserRelations = v.InferOutput<typeof UserRelationsSchema>

export const RoleRelationsSchema = v.object({
  ...RoleSchema.entries,
  userRoles: v.array(UserRoleSchema),
  rolePermissions: v.array(RolePermissionSchema),
})

export type RoleRelations = v.InferOutput<typeof RoleRelationsSchema>

export const PermissionRelationsSchema = v.object({
  ...PermissionSchema.entries,
  rolePermissions: v.array(RolePermissionSchema),
})

export type PermissionRelations = v.InferOutput<typeof PermissionRelationsSchema>

export const UserRoleRelationsSchema = v.object({
  ...UserRoleSchema.entries,
  user: UserSchema,
  role: RoleSchema,
})

export type UserRoleRelations = v.InferOutput<typeof UserRoleRelationsSchema>

export const RolePermissionRelationsSchema = v.object({
  ...RolePermissionSchema.entries,
  role: RoleSchema,
  permission: PermissionSchema,
})

export type RolePermissionRelations = v.InferOutput<typeof RolePermissionRelationsSchema>

export const AuditLogRelationsSchema = v.object({
  ...AuditLogSchema.entries,
  user: UserSchema,
})

export type AuditLogRelations = v.InferOutput<typeof AuditLogRelationsSchema>
