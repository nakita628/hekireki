import { type } from 'arktype'

export const OrganizationSchema = type({
  /** Organization ID */
  id: 'number.integer',
  /** Organization name */
  name: '1 <= string <= 200',
  /** URL-safe slug */
  slug: '1 <= string <= 100',
  /** Organization status */
  status: "'ACTIVE' | 'INACTIVE' | 'SUSPENDED'",
  /** Creation timestamp */
  createdAt: 'Date',
  /** Last update timestamp */
  updatedAt: 'Date',
})

export type Organization = typeof OrganizationSchema.infer

export const UserSchema = type({
  /** User ID */
  id: 'number.integer',
  /** Organization ID */
  organizationId: 'number.integer',
  /** Email address */
  email: 'string.email',
  /** Display name */
  name: '1 <= string <= 100',
  /** Creation timestamp */
  createdAt: 'Date',
  /** Last update timestamp */
  updatedAt: 'Date',
})

export type User = typeof UserSchema.infer

export const RoleSchema = type({
  /** Role ID */
  id: 'number.integer',
  /** Role name */
  name: '1 <= string <= 100',
  /** Role description */
  description: 'string | null',
  /** Creation timestamp */
  createdAt: 'Date',
  /** Last update timestamp */
  updatedAt: 'Date',
})

export type Role = typeof RoleSchema.infer

export const PermissionSchema = type({
  /** Permission ID */
  id: 'number.integer',
  /** Resource name */
  resource: '1 <= string <= 100',
  /** Action name */
  action: '1 <= string <= 100',
  /** Permission description */
  description: 'string | null',
  /** Creation timestamp */
  createdAt: 'Date',
})

export type Permission = typeof PermissionSchema.infer

export const UserRoleSchema = type({
  /** User ID */
  userId: 'number.integer',
  /** Role ID */
  roleId: 'number.integer',
  /** Assignment timestamp */
  assignedAt: 'Date',
})

export type UserRole = typeof UserRoleSchema.infer

export const RolePermissionSchema = type({
  /** Role ID */
  roleId: 'number.integer',
  /** Permission ID */
  permissionId: 'number.integer',
  /** Assignment timestamp */
  assignedAt: 'Date',
})

export type RolePermission = typeof RolePermissionSchema.infer

export const AuditLogSchema = type({
  /** Audit log ID */
  id: 'number.integer',
  /** User ID */
  userId: 'number.integer',
  /** Action performed */
  action: 'string',
  /** Resource name */
  resource: 'string',
  /** Action detail */
  detail: 'string | null',
  /** Client IP address */
  ipAddress: 'string | null',
  /** Action timestamp */
  createdAt: 'Date',
})

export type AuditLog = typeof AuditLogSchema.infer
