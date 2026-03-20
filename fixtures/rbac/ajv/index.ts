import type { FromSchema } from 'json-schema-to-ts'

export const OrganizationSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Organization ID
     */
    id: { type: 'integer' as const },
    /**
     * Organization name
     */
    name: { type: 'string' as const },
    /**
     * URL-safe slug
     */
    slug: { type: 'string' as const },
    /**
     * Organization status
     */
    status: { enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const },
    /**
     * Creation timestamp
     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    /**
     * Last update timestamp
     */
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'name', 'slug', 'status', 'createdAt', 'updatedAt'] as const,
  additionalProperties: false,
} as const

export type Organization = FromSchema<typeof OrganizationSchema>

export const UserSchema = {
  type: 'object' as const,
  properties: {
    /**
     * User ID
     */
    id: { type: 'integer' as const },
    /**
     * Organization ID
     */
    organizationId: { type: 'integer' as const },
    /**
     * Email address
     */
    email: { type: 'string' as const },
    /**
     * Display name
     */
    name: { type: 'string' as const },
    /**
     * Creation timestamp
     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    /**
     * Last update timestamp
     */
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'organizationId', 'email', 'name', 'createdAt', 'updatedAt'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const RoleSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Role ID
     */
    id: { type: 'integer' as const },
    /**
     * Role name
     */
    name: { type: 'string' as const },
    /**
     * Role description
     */
    description: { type: 'string' as const },
    /**
     * Creation timestamp
     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    /**
     * Last update timestamp
     */
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'name', 'createdAt', 'updatedAt'] as const,
  additionalProperties: false,
} as const

export type Role = FromSchema<typeof RoleSchema>

export const PermissionSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Permission ID
     */
    id: { type: 'integer' as const },
    /**
     * Resource name
     */
    resource: { type: 'string' as const },
    /**
     * Action name
     */
    action: { type: 'string' as const },
    /**
     * Permission description
     */
    description: { type: 'string' as const },
    /**
     * Creation timestamp
     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'resource', 'action', 'createdAt'] as const,
  additionalProperties: false,
} as const

export type Permission = FromSchema<typeof PermissionSchema>

export const UserRoleSchema = {
  type: 'object' as const,
  properties: {
    /**
     * User ID
     */
    userId: { type: 'integer' as const },
    /**
     * Role ID
     */
    roleId: { type: 'integer' as const },
    /**
     * Assignment timestamp
     */
    assignedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['userId', 'roleId', 'assignedAt'] as const,
  additionalProperties: false,
} as const

export type UserRole = FromSchema<typeof UserRoleSchema>

export const RolePermissionSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Role ID
     */
    roleId: { type: 'integer' as const },
    /**
     * Permission ID
     */
    permissionId: { type: 'integer' as const },
    /**
     * Assignment timestamp
     */
    assignedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['roleId', 'permissionId', 'assignedAt'] as const,
  additionalProperties: false,
} as const

export type RolePermission = FromSchema<typeof RolePermissionSchema>

export const AuditLogSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Audit log ID
     */
    id: { type: 'integer' as const },
    /**
     * User ID
     */
    userId: { type: 'integer' as const },
    /**
     * Action performed
     */
    action: { type: 'string' as const },
    /**
     * Resource name
     */
    resource: { type: 'string' as const },
    /**
     * Action detail
     */
    detail: { type: 'string' as const },
    /**
     * Client IP address
     */
    ipAddress: { type: 'string' as const },
    /**
     * Action timestamp
     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'userId', 'action', 'resource', 'createdAt'] as const,
  additionalProperties: false,
} as const

export type AuditLog = FromSchema<typeof AuditLogSchema>

export const OrganizationRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...OrganizationSchema.properties,
    users: { type: 'array' as const, items: UserSchema },
  },
  additionalProperties: false,
} as const

export type OrganizationRelations = FromSchema<typeof OrganizationRelationsSchema>

export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    organization: OrganizationSchema,
    userRoles: { type: 'array' as const, items: UserRoleSchema },
    auditLogs: { type: 'array' as const, items: AuditLogSchema },
  },
  additionalProperties: false,
} as const

export type UserRelations = FromSchema<typeof UserRelationsSchema>

export const RoleRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...RoleSchema.properties,
    userRoles: { type: 'array' as const, items: UserRoleSchema },
    rolePermissions: { type: 'array' as const, items: RolePermissionSchema },
  },
  additionalProperties: false,
} as const

export type RoleRelations = FromSchema<typeof RoleRelationsSchema>

export const PermissionRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...PermissionSchema.properties,
    rolePermissions: { type: 'array' as const, items: RolePermissionSchema },
  },
  additionalProperties: false,
} as const

export type PermissionRelations = FromSchema<typeof PermissionRelationsSchema>

export const UserRoleRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserRoleSchema.properties,
    user: UserSchema,
    role: RoleSchema,
  },
  additionalProperties: false,
} as const

export type UserRoleRelations = FromSchema<typeof UserRoleRelationsSchema>

export const RolePermissionRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...RolePermissionSchema.properties,
    role: RoleSchema,
    permission: PermissionSchema,
  },
  additionalProperties: false,
} as const

export type RolePermissionRelations = FromSchema<typeof RolePermissionRelationsSchema>

export const AuditLogRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...AuditLogSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type AuditLogRelations = FromSchema<typeof AuditLogRelationsSchema>
