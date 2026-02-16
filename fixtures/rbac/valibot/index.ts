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
})

export type Organization = v.InferInput<typeof OrganizationSchema>

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
})

export type User = v.InferInput<typeof UserSchema>

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
  description: v.nullish(v.string()),
})

export type Role = v.InferInput<typeof RoleSchema>

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
  description: v.nullish(v.string()),
})

export type Permission = v.InferInput<typeof PermissionSchema>

export const UserRoleSchema = v.object({
  /**
   * User ID
   */
  userId: v.pipe(v.number(), v.integer()),
  /**
   * Role ID
   */
  roleId: v.pipe(v.number(), v.integer()),
})

export type UserRole = v.InferInput<typeof UserRoleSchema>

export const RolePermissionSchema = v.object({
  /**
   * Role ID
   */
  roleId: v.pipe(v.number(), v.integer()),
  /**
   * Permission ID
   */
  permissionId: v.pipe(v.number(), v.integer()),
})

export type RolePermission = v.InferInput<typeof RolePermissionSchema>

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
  detail: v.nullish(v.string()),
  /**
   * Client IP address
   */
  ipAddress: v.nullish(v.string()),
})

export type AuditLog = v.InferInput<typeof AuditLogSchema>

export const OrganizationRelationsSchema = v.object({
  ...OrganizationSchema.entries,
  users: v.array(UserSchema),
})

export type OrganizationRelations = v.InferInput<typeof OrganizationRelationsSchema>

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  organization: OrganizationSchema,
  userRoles: v.array(UserRoleSchema),
  auditLogs: v.array(AuditLogSchema),
})

export type UserRelations = v.InferInput<typeof UserRelationsSchema>

export const RoleRelationsSchema = v.object({
  ...RoleSchema.entries,
  userRoles: v.array(UserRoleSchema),
  rolePermissions: v.array(RolePermissionSchema),
})

export type RoleRelations = v.InferInput<typeof RoleRelationsSchema>

export const PermissionRelationsSchema = v.object({
  ...PermissionSchema.entries,
  rolePermissions: v.array(RolePermissionSchema),
})

export type PermissionRelations = v.InferInput<typeof PermissionRelationsSchema>

export const UserRoleRelationsSchema = v.object({
  ...UserRoleSchema.entries,
  user: UserSchema,
  role: RoleSchema,
})

export type UserRoleRelations = v.InferInput<typeof UserRoleRelationsSchema>

export const RolePermissionRelationsSchema = v.object({
  ...RolePermissionSchema.entries,
  role: RoleSchema,
  permission: PermissionSchema,
})

export type RolePermissionRelations = v.InferInput<typeof RolePermissionRelationsSchema>

export const AuditLogRelationsSchema = v.object({
  ...AuditLogSchema.entries,
  user: UserSchema,
})

export type AuditLogRelations = v.InferInput<typeof AuditLogRelationsSchema>
