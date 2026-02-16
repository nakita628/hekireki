import * as z from 'zod'

export const OrganizationSchema = z.object({
  /**
   * Organization ID
   */
  id: z.number().int(),
  /**
   * Organization name
   */
  name: z.string().min(1).max(200),
  /**
   * URL-safe slug
   */
  slug: z.string().min(1).max(100),
})

export type Organization = z.infer<typeof OrganizationSchema>

export const UserSchema = z.object({
  /**
   * User ID
   */
  id: z.number().int(),
  /**
   * Organization ID
   */
  organizationId: z.number().int(),
  /**
   * Email address
   */
  email: z.email(),
  /**
   * Display name
   */
  name: z.string().min(1).max(100),
})

export type User = z.infer<typeof UserSchema>

export const RoleSchema = z.object({
  /**
   * Role ID
   */
  id: z.number().int(),
  /**
   * Role name
   */
  name: z.string().min(1).max(100),
  /**
   * Role description
   */
  description: z.string().nullable(),
})

export type Role = z.infer<typeof RoleSchema>

export const PermissionSchema = z.object({
  /**
   * Permission ID
   */
  id: z.number().int(),
  /**
   * Resource name
   */
  resource: z.string().min(1).max(100),
  /**
   * Action name
   */
  action: z.string().min(1).max(100),
  /**
   * Permission description
   */
  description: z.string().nullable(),
})

export type Permission = z.infer<typeof PermissionSchema>

export const UserRoleSchema = z.object({
  /**
   * User ID
   */
  userId: z.number().int(),
  /**
   * Role ID
   */
  roleId: z.number().int(),
})

export type UserRole = z.infer<typeof UserRoleSchema>

export const RolePermissionSchema = z.object({
  /**
   * Role ID
   */
  roleId: z.number().int(),
  /**
   * Permission ID
   */
  permissionId: z.number().int(),
})

export type RolePermission = z.infer<typeof RolePermissionSchema>

export const AuditLogSchema = z.object({
  /**
   * Audit log ID
   */
  id: z.number().int(),
  /**
   * User ID
   */
  userId: z.number().int(),
  /**
   * Action performed
   */
  action: z.string(),
  /**
   * Resource name
   */
  resource: z.string(),
  /**
   * Action detail
   */
  detail: z.string().nullable(),
  /**
   * Client IP address
   */
  ipAddress: z.string().nullable(),
})

export type AuditLog = z.infer<typeof AuditLogSchema>

export const OrganizationRelationsSchema = z.object({
  ...OrganizationSchema.shape,
  users: z.array(UserSchema),
})

export type OrganizationRelations = z.infer<typeof OrganizationRelationsSchema>

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  organization: OrganizationSchema,
  userRoles: z.array(UserRoleSchema),
  auditLogs: z.array(AuditLogSchema),
})

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const RoleRelationsSchema = z.object({
  ...RoleSchema.shape,
  userRoles: z.array(UserRoleSchema),
  rolePermissions: z.array(RolePermissionSchema),
})

export type RoleRelations = z.infer<typeof RoleRelationsSchema>

export const PermissionRelationsSchema = z.object({
  ...PermissionSchema.shape,
  rolePermissions: z.array(RolePermissionSchema),
})

export type PermissionRelations = z.infer<typeof PermissionRelationsSchema>

export const UserRoleRelationsSchema = z.object({
  ...UserRoleSchema.shape,
  user: UserSchema,
  role: RoleSchema,
})

export type UserRoleRelations = z.infer<typeof UserRoleRelationsSchema>

export const RolePermissionRelationsSchema = z.object({
  ...RolePermissionSchema.shape,
  role: RoleSchema,
  permission: PermissionSchema,
})

export type RolePermissionRelations = z.infer<typeof RolePermissionRelationsSchema>

export const AuditLogRelationsSchema = z.object({
  ...AuditLogSchema.shape,
  user: UserSchema,
})

export type AuditLogRelations = z.infer<typeof AuditLogRelationsSchema>
