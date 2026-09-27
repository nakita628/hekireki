import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

const utcNow = (() => {
  let now: Date | undefined
  return () => {
    if (now === undefined) {
      now = new Date()
      queueMicrotask(() => {
        now = undefined
      })
    }
    return now
  }
})()

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('emailVerified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('createdAt', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull().$onUpdate(utcNow),
    username: text('username'),
    displayUsername: text('displayUsername'),
    isAnonymous: boolean('isAnonymous').default(false),
    phoneNumber: text('phoneNumber'),
    phoneNumberVerified: boolean('phoneNumberVerified'),
    twoFactorEnabled: boolean('twoFactorEnabled').default(false),
    role: text('role'),
    banned: boolean('banned').default(false),
    banReason: text('banReason'),
    banExpires: timestamp('banExpires', { precision: 3 }),
    lastLoginMethod: text('lastLoginMethod'),
    stripeCustomerId: text('stripeCustomerId'),
  },
  (table) => [
    uniqueIndex('user_email_key').on(table.email),
    uniqueIndex('user_username_key').on(table.username),
    uniqueIndex('user_phoneNumber_key').on(table.phoneNumber),
  ],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull().$onUpdate(utcNow),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId').notNull(),
    impersonatedBy: text('impersonatedBy'),
    activeOrganizationId: text('activeOrganizationId'),
    activeTeamId: text('activeTeamId'),
  },
  (table) => [
    index('session_userId_idx').on(table.userId),
    uniqueIndex('session_token_key').on(table.token),
    foreignKey({ name: 'session_userId_fkey', columns: [table.userId], foreignColumns: [user.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId').notNull(),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { precision: 3 }),
    refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { precision: 3 }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('createdAt', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull().$onUpdate(utcNow),
  },
  (table) => [
    index('account_userId_idx').on(table.userId),
    foreignKey({ name: 'account_userId_fkey', columns: [table.userId], foreignColumns: [user.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
    createdAt: timestamp('createdAt', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull().$onUpdate(utcNow),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const twoFactor = pgTable(
  'twoFactor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backupCodes').notNull(),
    userId: text('userId').notNull(),
    verified: boolean('verified').default(true),
    failedVerificationCount: integer('failedVerificationCount').default(0),
    lockedUntil: timestamp('lockedUntil', { precision: 3 }),
  },
  (table) => [
    index('twoFactor_secret_idx').on(table.secret),
    index('twoFactor_userId_idx').on(table.userId),
    foreignKey({
      name: 'twoFactor_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('publicKey').notNull(),
    userId: text('userId').notNull(),
    credentialID: text('credentialID').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('deviceType').notNull(),
    backedUp: boolean('backedUp').notNull(),
    transports: text('transports'),
    createdAt: timestamp('createdAt', { precision: 3 }),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('passkey_userId_idx').on(table.userId),
    index('passkey_credentialID_idx').on(table.credentialID),
    foreignKey({ name: 'passkey_userId_fkey', columns: [table.userId], foreignColumns: [user.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const apikey = pgTable(
  'apikey',
  {
    id: text('id').primaryKey(),
    configId: text('configId').notNull().default('default'),
    name: text('name'),
    start: text('start'),
    referenceId: text('referenceId').notNull(),
    prefix: text('prefix'),
    key: text('key').notNull(),
    refillInterval: integer('refillInterval'),
    refillAmount: integer('refillAmount'),
    lastRefillAt: timestamp('lastRefillAt', { precision: 3 }),
    enabled: boolean('enabled').default(true),
    rateLimitEnabled: boolean('rateLimitEnabled').default(true),
    rateLimitTimeWindow: integer('rateLimitTimeWindow').default(86400000),
    rateLimitMax: integer('rateLimitMax').default(10),
    requestCount: integer('requestCount').default(0),
    remaining: integer('remaining'),
    lastRequest: timestamp('lastRequest', { precision: 3 }),
    expiresAt: timestamp('expiresAt', { precision: 3 }),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => [
    index('apikey_configId_idx').on(table.configId),
    index('apikey_referenceId_idx').on(table.referenceId),
    index('apikey_key_idx').on(table.key),
  ],
)

export const organization = pgTable(
  'organization',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logo: text('logo'),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    metadata: text('metadata'),
  },
  (table) => [uniqueIndex('organization_slug_key').on(table.slug)],
)

export const organizationRole = pgTable(
  'organizationRole',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId').notNull(),
    role: text('role').notNull(),
    permission: text('permission').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
    updatedAt: timestamp('updatedAt', { precision: 3 }).$onUpdate(utcNow),
  },
  (table) => [
    index('organizationRole_organizationId_idx').on(table.organizationId),
    index('organizationRole_role_idx').on(table.role),
    foreignKey({
      name: 'organizationRole_organizationId_fkey',
      columns: [table.organizationId],
      foreignColumns: [organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const team = pgTable(
  'team',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    memberCount: integer('memberCount').notNull().default(0),
    organizationId: text('organizationId').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    updatedAt: timestamp('updatedAt', { precision: 3 }).$onUpdate(utcNow),
  },
  (table) => [
    index('team_organizationId_idx').on(table.organizationId),
    foreignKey({
      name: 'team_organizationId_fkey',
      columns: [table.organizationId],
      foreignColumns: [organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const teamMember = pgTable(
  'teamMember',
  {
    id: text('id').primaryKey(),
    teamId: text('teamId').notNull(),
    userId: text('userId').notNull(),
    membershipKey: text('membershipKey'),
    createdAt: timestamp('createdAt', { precision: 3 }),
  },
  (table) => [
    index('teamMember_teamId_idx').on(table.teamId),
    index('teamMember_userId_idx').on(table.userId),
    uniqueIndex('teamMember_membershipKey_key').on(table.membershipKey),
    foreignKey({
      name: 'teamMember_teamId_fkey',
      columns: [table.teamId],
      foreignColumns: [team.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'teamMember_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId').notNull(),
    userId: text('userId').notNull(),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
  },
  (table) => [
    index('member_organizationId_idx').on(table.organizationId),
    index('member_userId_idx').on(table.userId),
    foreignKey({
      name: 'member_organizationId_fkey',
      columns: [table.organizationId],
      foreignColumns: [organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({ name: 'member_userId_fkey', columns: [table.userId], foreignColumns: [user.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId').notNull(),
    email: text('email').notNull(),
    role: text('role'),
    teamId: text('teamId'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
    createdAt: timestamp('createdAt', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
    inviterId: text('inviterId').notNull(),
  },
  (table) => [
    index('invitation_organizationId_idx').on(table.organizationId),
    index('invitation_email_idx').on(table.email),
    foreignKey({
      name: 'invitation_organizationId_fkey',
      columns: [table.organizationId],
      foreignColumns: [organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'invitation_inviterId_fkey',
      columns: [table.inviterId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('publicKey').notNull(),
  privateKey: text('privateKey').notNull(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
  expiresAt: timestamp('expiresAt', { precision: 3 }),
  alg: text('alg'),
  crv: text('crv'),
})

export const oauthClient = pgTable(
  'oauthClient',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId').notNull(),
    clientSecret: text('clientSecret'),
    clientDiscoveryId: text('clientDiscoveryId'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skipConsent'),
    enableEndSession: boolean('enableEndSession'),
    subjectType: text('subjectType'),
    scopes: text('scopes').array(),
    clientCredentialsScopes: text('clientCredentialsScopes').array().default([]),
    userId: text('userId'),
    createdAt: timestamp('createdAt', { precision: 3 }),
    updatedAt: timestamp('updatedAt', { precision: 3 }),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts').array(),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('softwareId'),
    softwareVersion: text('softwareVersion'),
    softwareStatement: text('softwareStatement'),
    redirectUris: text('redirectUris').array(),
    postLogoutRedirectUris: text('postLogoutRedirectUris').array(),
    backchannelLogoutUri: text('backchannelLogoutUri'),
    backchannelLogoutSessionRequired: boolean('backchannelLogoutSessionRequired'),
    tokenEndpointAuthMethod: text('tokenEndpointAuthMethod'),
    applicationType: text('applicationType'),
    jwks: text('jwks'),
    jwksUri: text('jwksUri'),
    grantTypes: text('grantTypes').array(),
    responseTypes: text('responseTypes').array(),
    requirePKCE: boolean('requirePKCE'),
    dpopBoundAccessTokens: boolean('dpopBoundAccessTokens').default(false),
    referenceId: text('referenceId'),
    metadata: jsonb('metadata'),
  },
  (table) => [
    index('oauthClient_userId_idx').on(table.userId),
    unique('oauthClient_clientId_key').on(table.clientId),
    foreignKey({
      name: 'oauthClient_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const oauthResource = pgTable(
  'oauthResource',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    name: text('name').notNull(),
    accessTokenTtl: integer('accessTokenTtl'),
    refreshTokenTtl: integer('refreshTokenTtl'),
    signingAlgorithm: text('signingAlgorithm'),
    signingKeyId: text('signingKeyId'),
    allowedScopes: text('allowedScopes').array(),
    customClaims: jsonb('customClaims'),
    dpopBoundAccessTokensRequired: boolean('dpopBoundAccessTokensRequired').default(false),
    disabled: boolean('disabled').default(false),
    createdAt: timestamp('createdAt', { precision: 3 }),
    updatedAt: timestamp('updatedAt', { precision: 3 }),
    policyVersion: integer('policyVersion').default(1),
    metadata: jsonb('metadata'),
  },
  (table) => [unique('oauthResource_identifier_key').on(table.identifier)],
)

export const oauthClientResource = pgTable(
  'oauthClientResource',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId').notNull(),
    resourceId: text('resourceId').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('createdAt', { precision: 3 }),
  },
  (table) => [
    index('oauthClientResource_clientId_idx').on(table.clientId),
    index('oauthClientResource_resourceId_idx').on(table.resourceId),
    uniqueIndex('oauthClientResource_clientId_resourceId_uidx').on(
      table.clientId,
      table.resourceId,
    ),
    foreignKey({
      name: 'oauthClientResource_clientId_fkey',
      columns: [table.clientId],
      foreignColumns: [oauthClient.clientId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'oauthClientResource_resourceId_fkey',
      columns: [table.resourceId],
      foreignColumns: [oauthResource.identifier],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const oauthRefreshToken = pgTable(
  'oauthRefreshToken',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    clientId: text('clientId').notNull(),
    sessionId: text('sessionId'),
    userId: text('userId').notNull(),
    referenceId: text('referenceId'),
    authorizationCodeId: text('authorizationCodeId'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requestedUserInfoClaims').array(),
    expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    revoked: timestamp('revoked', { precision: 3 }),
    rotatedAt: timestamp('rotatedAt', { precision: 3 }),
    rotationReplayResponse: text('rotationReplayResponse'),
    rotationReplayExpiresAt: timestamp('rotationReplayExpiresAt', { precision: 3 }),
    authTime: timestamp('authTime', { precision: 3 }),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array(),
  },
  (table) => [
    index('oauthRefreshToken_clientId_idx').on(table.clientId),
    index('oauthRefreshToken_sessionId_idx').on(table.sessionId),
    index('oauthRefreshToken_userId_idx').on(table.userId),
    index('oauthRefreshToken_authorizationCodeId_idx').on(table.authorizationCodeId),
    uniqueIndex('oauthRefreshToken_token_key').on(table.token),
    foreignKey({
      name: 'oauthRefreshToken_clientId_fkey',
      columns: [table.clientId],
      foreignColumns: [oauthClient.clientId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'oauthRefreshToken_sessionId_fkey',
      columns: [table.sessionId],
      foreignColumns: [session.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    foreignKey({
      name: 'oauthRefreshToken_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const oauthAccessToken = pgTable(
  'oauthAccessToken',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    clientId: text('clientId').notNull(),
    sessionId: text('sessionId'),
    userId: text('userId'),
    referenceId: text('referenceId'),
    authorizationCodeId: text('authorizationCodeId'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requestedUserInfoClaims').array(),
    refreshId: text('refreshId'),
    expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    revoked: timestamp('revoked', { precision: 3 }),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array(),
  },
  (table) => [
    index('oauthAccessToken_clientId_idx').on(table.clientId),
    index('oauthAccessToken_sessionId_idx').on(table.sessionId),
    index('oauthAccessToken_userId_idx').on(table.userId),
    index('oauthAccessToken_authorizationCodeId_idx').on(table.authorizationCodeId),
    index('oauthAccessToken_refreshId_idx').on(table.refreshId),
    uniqueIndex('oauthAccessToken_token_key').on(table.token),
    foreignKey({
      name: 'oauthAccessToken_clientId_fkey',
      columns: [table.clientId],
      foreignColumns: [oauthClient.clientId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'oauthAccessToken_sessionId_fkey',
      columns: [table.sessionId],
      foreignColumns: [session.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    foreignKey({
      name: 'oauthAccessToken_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'oauthAccessToken_refreshId_fkey',
      columns: [table.refreshId],
      foreignColumns: [oauthRefreshToken.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const oauthConsent = pgTable(
  'oauthConsent',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId').notNull(),
    userId: text('userId'),
    referenceId: text('referenceId'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requestedUserInfoClaims').array(),
    scopes: text('scopes').array(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  },
  (table) => [
    index('oauthConsent_clientId_idx').on(table.clientId),
    index('oauthConsent_userId_idx').on(table.userId),
    foreignKey({
      name: 'oauthConsent_clientId_fkey',
      columns: [table.clientId],
      foreignColumns: [oauthClient.clientId],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'oauthConsent_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const oauthClientAssertion = pgTable('oauthClientAssertion', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
})

export const deviceCode = pgTable(
  'deviceCode',
  {
    id: text('id').primaryKey(),
    deviceCode: text('deviceCode').notNull(),
    userCode: text('userCode').notNull(),
    userId: text('userId'),
    expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
    status: text('status').notNull(),
    lastPolledAt: timestamp('lastPolledAt', { precision: 3 }),
    pollingInterval: integer('pollingInterval'),
    clientId: text('clientId'),
    scope: text('scope'),
  },
  (table) => [
    uniqueIndex('deviceCode_deviceCode_uidx').on(table.deviceCode),
    uniqueIndex('deviceCode_userCode_uidx').on(table.userCode),
  ],
)

export const ssoProvider = pgTable(
  'ssoProvider',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    oidcConfig: text('oidcConfig'),
    samlConfig: text('samlConfig'),
    userId: text('userId').notNull(),
    providerId: text('providerId').notNull(),
    organizationId: text('organizationId'),
    domain: text('domain').notNull(),
  },
  (table) => [
    uniqueIndex('ssoProvider_providerId_key').on(table.providerId),
    foreignKey({
      name: 'ssoProvider_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const scimManagedConnection = pgTable(
  'scimManagedConnection',
  {
    id: text('id').primaryKey(),
    creationRequestId: text('creationRequestId').notNull(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    status: text('status').notNull(),
    revision: integer('revision').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    createdBy: text('createdBy').notNull(),
    decommissionStartedAt: timestamp('decommissionStartedAt', { precision: 3 }),
    decommissionStartedBy: text('decommissionStartedBy'),
    decommissionedAt: timestamp('decommissionedAt', { precision: 3 }),
    decommissionedBy: text('decommissionedBy'),
  },
  (table) => [
    index('scimManagedConnection_provisioningDomainId_idx').on(table.provisioningDomainId),
    uniqueIndex('scimManagedConnection_creationRequestId_key').on(table.creationRequestId),
    uniqueIndex('scimManagedConnection_connectionId_key').on(table.connectionId),
  ],
)

export const scimManagedCredential = pgTable(
  'scimManagedCredential',
  {
    id: text('id').primaryKey(),
    connectionRecordId: text('connectionRecordId').notNull(),
    credentialId: text('credentialId').notNull(),
    tokenDigest: text('tokenDigest').notNull(),
    hashVersion: text('hashVersion').notNull(),
    activeSlotKey: text('activeSlotKey').notNull(),
    status: text('status').notNull(),
    serializedScopes: text('serializedScopes').notNull(),
    expiresAt: timestamp('expiresAt', { precision: 3 }).notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    createdBy: text('createdBy').notNull(),
    lastUsedAt: timestamp('lastUsedAt', { precision: 3 }),
    revokedAt: timestamp('revokedAt', { precision: 3 }),
    revokedBy: text('revokedBy'),
    decommissionedAt: timestamp('decommissionedAt', { precision: 3 }),
  },
  (table) => [
    index('scimManagedCredential_connectionRecordId_idx').on(table.connectionRecordId),
    uniqueIndex('scimManagedCredential_credentialId_key').on(table.credentialId),
    uniqueIndex('scimManagedCredential_activeSlotKey_key').on(table.activeSlotKey),
    foreignKey({
      name: 'scimManagedCredential_connectionRecordId_fkey',
      columns: [table.connectionRecordId],
      foreignColumns: [scimManagedConnection.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const scimManagedConnectionEvent = pgTable(
  'scimManagedConnectionEvent',
  {
    id: text('id').primaryKey(),
    connectionRecordId: text('connectionRecordId').notNull(),
    eventKey: text('eventKey').notNull(),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    actorId: text('actorId').notNull(),
    credentialId: text('credentialId'),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
  },
  (table) => [
    index('scimManagedConnectionEvent_connectionRecordId_idx').on(table.connectionRecordId),
    uniqueIndex('scimManagedConnectionEvent_eventKey_key').on(table.eventKey),
    foreignKey({
      name: 'scimManagedConnectionEvent_connectionRecordId_fkey',
      columns: [table.connectionRecordId],
      foreignColumns: [scimManagedConnection.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const scimConnectionBinding = pgTable(
  'scimConnectionBinding',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    connectionKey: text('connectionKey').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    decommissionedAt: timestamp('decommissionedAt', { precision: 3 }),
    decommissionStatus: text('decommissionStatus').notNull().default('active'),
    decommissionCursorUserId: text('decommissionCursorUserId'),
    decommissionReconciledUserCount: integer('decommissionReconciledUserCount')
      .notNull()
      .default(0),
    decommissionBatchCount: integer('decommissionBatchCount').notNull().default(0),
    decommissionRevision: integer('decommissionRevision').notNull().default(0),
    decommissionCompletedAt: timestamp('decommissionCompletedAt', { precision: 3 }),
    decommissionLeaseId: text('decommissionLeaseId'),
    decommissionLeaseExpiresAt: timestamp('decommissionLeaseExpiresAt', { precision: 3 }),
  },
  (table) => [
    index('scimConnectionBinding_connectionId_idx').on(table.connectionId),
    uniqueIndex('scimConnectionBinding_connectionKey_key').on(table.connectionKey),
  ],
)

export const scimIdentityTombstone = pgTable(
  'scimIdentityTombstone',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    externalId: text('externalId').notNull(),
    externalIdKey: text('externalIdKey').notNull(),
    userId: text('userId').notNull(),
    profile: text('profile').notNull(),
    deletedAt: timestamp('deletedAt', { precision: 3 }).notNull(),
  },
  (table) => [
    index('scimIdentityTombstone_connectionId_idx').on(table.connectionId),
    index('scimIdentityTombstone_provisioningDomainId_idx').on(table.provisioningDomainId),
    index('scimIdentityTombstone_userId_idx').on(table.userId),
    uniqueIndex('scimIdentityTombstone_externalIdKey_key').on(table.externalIdKey),
    foreignKey({
      name: 'scimIdentityTombstone_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const scimSubject = pgTable(
  'scimSubject',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    profileSourceId: text('profileSourceId'),
    revision: integer('revision').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  },
  (table) => [
    index('scimSubject_profileSourceId_idx').on(table.profileSourceId),
    uniqueIndex('scimSubject_userId_key').on(table.userId),
    foreignKey({
      name: 'scimSubject_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const scimUser = pgTable(
  'scimUser',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    userId: text('userId').notNull(),
    connectionUserKey: text('connectionUserKey').notNull(),
    userName: text('userName').notNull(),
    userNameKey: text('userNameKey').notNull(),
    primaryEmail: text('primaryEmail').notNull(),
    workEmailValueIndex: text('workEmailValueIndex').notNull(),
    emailValueIndex: text('emailValueIndex').notNull(),
    displayName: text('displayName').notNull(),
    formattedName: text('formattedName').notNull(),
    givenName: text('givenName'),
    familyName: text('familyName'),
    serializedEmails: text('serializedEmails').notNull(),
    serializedAttributes: text('serializedAttributes'),
    externalId: text('externalId'),
    externalIdKey: text('externalIdKey'),
    active: boolean('active').notNull(),
    orderKey: text('orderKey').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  },
  (table) => [
    index('scimUser_connectionId_idx').on(table.connectionId),
    index('scimUser_provisioningDomainId_idx').on(table.provisioningDomainId),
    index('scimUser_userId_idx').on(table.userId),
    uniqueIndex('scimUser_connectionUserKey_key').on(table.connectionUserKey),
    uniqueIndex('scimUser_userNameKey_key').on(table.userNameKey),
    uniqueIndex('scimUser_externalIdKey_key').on(table.externalIdKey),
    uniqueIndex('scimUser_orderKey_key').on(table.orderKey),
    foreignKey({ name: 'scimUser_userId_fkey', columns: [table.userId], foreignColumns: [user.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const scimProjectionGrant = pgTable(
  'scimProjectionGrant',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    scimUserId: text('scimUserId').notNull(),
    userId: text('userId').notNull(),
    sourceKind: text('sourceKind').notNull(),
    sourceId: text('sourceId').notNull(),
    sourceValue: text('sourceValue'),
    role: text('role').notNull(),
    grantKey: text('grantKey').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  },
  (table) => [
    index('scimProjectionGrant_connectionId_idx').on(table.connectionId),
    index('scimProjectionGrant_provisioningDomainId_idx').on(table.provisioningDomainId),
    index('scimProjectionGrant_scimUserId_idx').on(table.scimUserId),
    index('scimProjectionGrant_userId_idx').on(table.userId),
    uniqueIndex('scimProjectionGrant_grantKey_key').on(table.grantKey),
    foreignKey({
      name: 'scimProjectionGrant_scimUserId_fkey',
      columns: [table.scimUserId],
      foreignColumns: [scimUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'scimProjectionGrant_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const scimGroup = pgTable(
  'scimGroup',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    revision: integer('revision').notNull().default(0),
    displayName: text('displayName').notNull(),
    displayNameKey: text('displayNameKey').notNull(),
    externalId: text('externalId'),
    externalIdKey: text('externalIdKey'),
    orderKey: text('orderKey').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
    updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  },
  (table) => [
    index('scimGroup_connectionId_idx').on(table.connectionId),
    index('scimGroup_provisioningDomainId_idx').on(table.provisioningDomainId),
    uniqueIndex('scimGroup_displayNameKey_key').on(table.displayNameKey),
    uniqueIndex('scimGroup_externalIdKey_key').on(table.externalIdKey),
    uniqueIndex('scimGroup_orderKey_key').on(table.orderKey),
  ],
)

export const scimGroupMember = pgTable(
  'scimGroupMember',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    groupId: text('groupId').notNull(),
    scimUserId: text('scimUserId').notNull(),
    membershipKey: text('membershipKey').notNull(),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
  },
  (table) => [
    index('scimGroupMember_connectionId_idx').on(table.connectionId),
    index('scimGroupMember_groupId_idx').on(table.groupId),
    index('scimGroupMember_scimUserId_idx').on(table.scimUserId),
    uniqueIndex('scimGroupMember_membershipKey_key').on(table.membershipKey),
    foreignKey({
      name: 'scimGroupMember_groupId_fkey',
      columns: [table.groupId],
      foreignColumns: [scimGroup.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'scimGroupMember_scimUserId_fkey',
      columns: [table.scimUserId],
      foreignColumns: [scimUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const walletAddress = pgTable(
  'walletAddress',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    address: text('address').notNull(),
    chainId: integer('chainId').notNull(),
    isPrimary: boolean('isPrimary').notNull().default(false),
    createdAt: timestamp('createdAt', { precision: 3 }).notNull(),
  },
  (table) => [
    index('walletAddress_userId_idx').on(table.userId),
    foreignKey({
      name: 'walletAddress_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const subscription = pgTable('subscription', {
  id: text('id').primaryKey(),
  plan: text('plan').notNull(),
  referenceId: text('referenceId').notNull(),
  stripeCustomerId: text('stripeCustomerId'),
  stripeSubscriptionId: text('stripeSubscriptionId'),
  status: text('status').notNull().default('incomplete'),
  periodStart: timestamp('periodStart', { precision: 3 }),
  periodEnd: timestamp('periodEnd', { precision: 3 }),
  trialStart: timestamp('trialStart', { precision: 3 }),
  trialEnd: timestamp('trialEnd', { precision: 3 }),
  cancelAtPeriodEnd: boolean('cancelAtPeriodEnd').default(false),
  cancelAt: timestamp('cancelAt', { precision: 3 }),
  canceledAt: timestamp('canceledAt', { precision: 3 }),
  endedAt: timestamp('endedAt', { precision: 3 }),
  seats: integer('seats'),
  billingInterval: text('billingInterval'),
  stripeScheduleId: text('stripeScheduleId'),
})

export const rateLimit = pgTable(
  'rateLimit',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    count: integer('count').notNull(),
    lastRequest: bigint('lastRequest', { mode: 'bigint' }).notNull(),
  },
  (table) => [uniqueIndex('rateLimit_key_key').on(table.key)],
)

export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  accounts: many(account),
  twofactors: many(twoFactor),
  passkeys: many(passkey),
  teammembers: many(teamMember),
  members: many(member),
  invitations: many(invitation),
  oauthclients: many(oauthClient),
  oauthrefreshtokens: many(oauthRefreshToken),
  oauthaccesstokens: many(oauthAccessToken),
  oauthconsents: many(oauthConsent),
  ssoproviders: many(ssoProvider),
  scimidentitytombstones: many(scimIdentityTombstone),
  scimsubject: one(scimSubject),
  scimusers: many(scimUser),
  scimprojectiongrants: many(scimProjectionGrant),
  walletaddresss: many(walletAddress),
}))

export const sessionRelations = relations(session, ({ one, many }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
  oauthrefreshtokens: many(oauthRefreshToken),
  oauthaccesstokens: many(oauthAccessToken),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, { fields: [twoFactor.userId], references: [user.id] }),
}))

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, { fields: [passkey.userId], references: [user.id] }),
}))

export const organizationRelations = relations(organization, ({ many }) => ({
  organizationroles: many(organizationRole),
  teams: many(team),
  members: many(member),
  invitations: many(invitation),
}))

export const organizationRoleRelations = relations(organizationRole, ({ one }) => ({
  organization: one(organization, {
    fields: [organizationRole.organizationId],
    references: [organization.id],
  }),
}))

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, { fields: [team.organizationId], references: [organization.id] }),
  teammembers: many(teamMember),
}))

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, { fields: [teamMember.teamId], references: [team.id] }),
  user: one(user, { fields: [teamMember.userId], references: [user.id] }),
}))

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [member.userId], references: [user.id] }),
}))

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [invitation.inviterId], references: [user.id] }),
}))

export const oauthClientRelations = relations(oauthClient, ({ one, many }) => ({
  user: one(user, { fields: [oauthClient.userId], references: [user.id] }),
  oauthclientresources: many(oauthClientResource),
  oauthrefreshtokens: many(oauthRefreshToken),
  oauthaccesstokens: many(oauthAccessToken),
  oauthconsents: many(oauthConsent),
}))

export const oauthResourceRelations = relations(oauthResource, ({ many }) => ({
  oauthclientresources: many(oauthClientResource),
}))

export const oauthClientResourceRelations = relations(oauthClientResource, ({ one }) => ({
  oauthclient: one(oauthClient, {
    fields: [oauthClientResource.clientId],
    references: [oauthClient.clientId],
  }),
  oauthresource: one(oauthResource, {
    fields: [oauthClientResource.resourceId],
    references: [oauthResource.identifier],
  }),
}))

export const oauthRefreshTokenRelations = relations(oauthRefreshToken, ({ one, many }) => ({
  oauthclient: one(oauthClient, {
    fields: [oauthRefreshToken.clientId],
    references: [oauthClient.clientId],
  }),
  session: one(session, { fields: [oauthRefreshToken.sessionId], references: [session.id] }),
  user: one(user, { fields: [oauthRefreshToken.userId], references: [user.id] }),
  oauthaccesstokens: many(oauthAccessToken),
}))

export const oauthAccessTokenRelations = relations(oauthAccessToken, ({ one }) => ({
  oauthclient: one(oauthClient, {
    fields: [oauthAccessToken.clientId],
    references: [oauthClient.clientId],
  }),
  session: one(session, { fields: [oauthAccessToken.sessionId], references: [session.id] }),
  user: one(user, { fields: [oauthAccessToken.userId], references: [user.id] }),
  oauthrefreshtoken: one(oauthRefreshToken, {
    fields: [oauthAccessToken.refreshId],
    references: [oauthRefreshToken.id],
  }),
}))

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
  oauthclient: one(oauthClient, {
    fields: [oauthConsent.clientId],
    references: [oauthClient.clientId],
  }),
  user: one(user, { fields: [oauthConsent.userId], references: [user.id] }),
}))

export const ssoProviderRelations = relations(ssoProvider, ({ one }) => ({
  user: one(user, { fields: [ssoProvider.userId], references: [user.id] }),
}))

export const scimManagedConnectionRelations = relations(scimManagedConnection, ({ many }) => ({
  scimmanagedcredentials: many(scimManagedCredential),
  scimmanagedconnectionevents: many(scimManagedConnectionEvent),
}))

export const scimManagedCredentialRelations = relations(scimManagedCredential, ({ one }) => ({
  scimmanagedconnection: one(scimManagedConnection, {
    fields: [scimManagedCredential.connectionRecordId],
    references: [scimManagedConnection.id],
  }),
}))

export const scimManagedConnectionEventRelations = relations(
  scimManagedConnectionEvent,
  ({ one }) => ({
    scimmanagedconnection: one(scimManagedConnection, {
      fields: [scimManagedConnectionEvent.connectionRecordId],
      references: [scimManagedConnection.id],
    }),
  }),
)

export const scimIdentityTombstoneRelations = relations(scimIdentityTombstone, ({ one }) => ({
  user: one(user, { fields: [scimIdentityTombstone.userId], references: [user.id] }),
}))

export const scimSubjectRelations = relations(scimSubject, ({ one }) => ({
  user: one(user, { fields: [scimSubject.userId], references: [user.id] }),
}))

export const scimUserRelations = relations(scimUser, ({ one, many }) => ({
  user: one(user, { fields: [scimUser.userId], references: [user.id] }),
  scimprojectiongrants: many(scimProjectionGrant),
  scimgroupmembers: many(scimGroupMember),
}))

export const scimProjectionGrantRelations = relations(scimProjectionGrant, ({ one }) => ({
  scimuser: one(scimUser, { fields: [scimProjectionGrant.scimUserId], references: [scimUser.id] }),
  user: one(user, { fields: [scimProjectionGrant.userId], references: [user.id] }),
}))

export const scimGroupRelations = relations(scimGroup, ({ many }) => ({
  scimgroupmembers: many(scimGroupMember),
}))

export const scimGroupMemberRelations = relations(scimGroupMember, ({ one }) => ({
  scimgroup: one(scimGroup, { fields: [scimGroupMember.groupId], references: [scimGroup.id] }),
  scimuser: one(scimUser, { fields: [scimGroupMember.scimUserId], references: [scimUser.id] }),
}))

export const walletAddressRelations = relations(walletAddress, ({ one }) => ({
  user: one(user, { fields: [walletAddress.userId], references: [user.id] }),
}))
