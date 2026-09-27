import {
  bigint,
  boolean,
  datetime,
  foreignKey,
  index,
  int,
  mysqlTable,
  text,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
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

export const user = mysqlTable(
  'user',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    name: text('name').notNull(),
    email: varchar('email', { length: 191 }).notNull(),
    emailVerified: boolean('emailVerified').notNull().default(false),
    image: text('image'),
    createdAt: datetime('createdAt', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$defaultFn(utcNow),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull().$onUpdate(utcNow),
    username: varchar('username', { length: 191 }),
    displayUsername: text('displayUsername'),
    isAnonymous: boolean('isAnonymous').default(false),
    phoneNumber: varchar('phoneNumber', { length: 191 }),
    phoneNumberVerified: boolean('phoneNumberVerified'),
    twoFactorEnabled: boolean('twoFactorEnabled').default(false),
    role: text('role'),
    banned: boolean('banned').default(false),
    banReason: text('banReason'),
    banExpires: datetime('banExpires', { fsp: 3 }),
    lastLoginMethod: text('lastLoginMethod'),
    stripeCustomerId: text('stripeCustomerId'),
  },
  (table) => [
    uniqueIndex('user_email_key').on(table.email),
    uniqueIndex('user_username_key').on(table.username),
    uniqueIndex('user_phoneNumber_key').on(table.phoneNumber),
  ],
)

export const session = mysqlTable(
  'session',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    token: varchar('token', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$defaultFn(utcNow),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull().$onUpdate(utcNow),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: varchar('userId', { length: 191 }).notNull(),
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

export const account = mysqlTable(
  'account',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: varchar('userId', { length: 191 }).notNull(),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: datetime('accessTokenExpiresAt', { fsp: 3 }),
    refreshTokenExpiresAt: datetime('refreshTokenExpiresAt', { fsp: 3 }),
    scope: text('scope'),
    password: text('password'),
    createdAt: datetime('createdAt', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$defaultFn(utcNow),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull().$onUpdate(utcNow),
  },
  (table) => [
    index('account_userId_idx').on(table.userId),
    foreignKey({ name: 'account_userId_fkey', columns: [table.userId], foreignColumns: [user.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const verification = mysqlTable(
  'verification',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$defaultFn(utcNow),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull().$onUpdate(utcNow),
  },
  (table) => [index('verification_identifier_idx').on(sql`${table.identifier}(191)`)],
)

export const twoFactor = mysqlTable(
  'twoFactor',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backupCodes').notNull(),
    userId: varchar('userId', { length: 191 }).notNull(),
    verified: boolean('verified').default(true),
    failedVerificationCount: int('failedVerificationCount').default(0),
    lockedUntil: datetime('lockedUntil', { fsp: 3 }),
  },
  (table) => [
    index('twoFactor_secret_idx').on(sql`${table.secret}(191)`),
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

export const passkey = mysqlTable(
  'passkey',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    name: text('name'),
    publicKey: text('publicKey').notNull(),
    userId: varchar('userId', { length: 191 }).notNull(),
    credentialID: text('credentialID').notNull(),
    counter: int('counter').notNull(),
    deviceType: text('deviceType').notNull(),
    backedUp: boolean('backedUp').notNull(),
    transports: text('transports'),
    createdAt: datetime('createdAt', { fsp: 3 }),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('passkey_userId_idx').on(table.userId),
    index('passkey_credentialID_idx').on(sql`${table.credentialID}(191)`),
    foreignKey({ name: 'passkey_userId_fkey', columns: [table.userId], foreignColumns: [user.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const apikey = mysqlTable(
  'apikey',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    configId: text('configId').notNull(),
    name: text('name'),
    start: text('start'),
    referenceId: text('referenceId').notNull(),
    prefix: text('prefix'),
    key: text('key').notNull(),
    refillInterval: int('refillInterval'),
    refillAmount: int('refillAmount'),
    lastRefillAt: datetime('lastRefillAt', { fsp: 3 }),
    enabled: boolean('enabled').default(true),
    rateLimitEnabled: boolean('rateLimitEnabled').default(true),
    rateLimitTimeWindow: int('rateLimitTimeWindow').default(86400000),
    rateLimitMax: int('rateLimitMax').default(10),
    requestCount: int('requestCount').default(0),
    remaining: int('remaining'),
    lastRequest: datetime('lastRequest', { fsp: 3 }),
    expiresAt: datetime('expiresAt', { fsp: 3 }),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => [
    index('apikey_configId_idx').on(sql`${table.configId}(191)`),
    index('apikey_referenceId_idx').on(sql`${table.referenceId}(191)`),
    index('apikey_key_idx').on(sql`${table.key}(191)`),
  ],
)

export const organization = mysqlTable(
  'organization',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    name: text('name').notNull(),
    slug: varchar('slug', { length: 191 }).notNull(),
    logo: text('logo'),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    metadata: text('metadata'),
  },
  (table) => [uniqueIndex('organization_slug_key').on(table.slug)],
)

export const organizationRole = mysqlTable(
  'organizationRole',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    organizationId: varchar('organizationId', { length: 191 }).notNull(),
    role: text('role').notNull(),
    permission: text('permission').notNull(),
    createdAt: datetime('createdAt', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$defaultFn(utcNow),
    updatedAt: datetime('updatedAt', { fsp: 3 }).$onUpdate(utcNow),
  },
  (table) => [
    index('organizationRole_organizationId_idx').on(table.organizationId),
    index('organizationRole_role_idx').on(sql`${table.role}(191)`),
    foreignKey({
      name: 'organizationRole_organizationId_fkey',
      columns: [table.organizationId],
      foreignColumns: [organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const team = mysqlTable(
  'team',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    name: text('name').notNull(),
    memberCount: int('memberCount').notNull().default(0),
    organizationId: varchar('organizationId', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).$onUpdate(utcNow),
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

export const teamMember = mysqlTable(
  'teamMember',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    teamId: varchar('teamId', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }).notNull(),
    membershipKey: varchar('membershipKey', { length: 191 }),
    createdAt: datetime('createdAt', { fsp: 3 }),
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

export const member = mysqlTable(
  'member',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    organizationId: varchar('organizationId', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }).notNull(),
    role: text('role').notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
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

export const invitation = mysqlTable(
  'invitation',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    organizationId: varchar('organizationId', { length: 191 }).notNull(),
    email: text('email').notNull(),
    role: text('role'),
    teamId: text('teamId'),
    status: text('status').notNull(),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$defaultFn(utcNow),
    inviterId: varchar('inviterId', { length: 191 }).notNull(),
  },
  (table) => [
    index('invitation_organizationId_idx').on(table.organizationId),
    index('invitation_email_idx').on(sql`${table.email}(191)`),
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

export const jwks = mysqlTable('jwks', {
  id: varchar('id', { length: 191 }).primaryKey(),
  publicKey: text('publicKey').notNull(),
  privateKey: text('privateKey').notNull(),
  createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
  expiresAt: datetime('expiresAt', { fsp: 3 }),
  alg: text('alg'),
  crv: text('crv'),
})

export const oauthClient = mysqlTable(
  'oauthClient',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    clientId: varchar('clientId', { length: 191 }).notNull(),
    clientSecret: text('clientSecret'),
    clientDiscoveryId: text('clientDiscoveryId'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skipConsent'),
    enableEndSession: boolean('enableEndSession'),
    subjectType: text('subjectType'),
    scopes: varchar('scopes', { length: 191 }),
    clientCredentialsScopes: varchar('clientCredentialsScopes', { length: 191 }).default('[]'),
    userId: varchar('userId', { length: 191 }),
    createdAt: datetime('createdAt', { fsp: 3 }),
    updatedAt: datetime('updatedAt', { fsp: 3 }),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: varchar('contacts', { length: 191 }),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('softwareId'),
    softwareVersion: text('softwareVersion'),
    softwareStatement: text('softwareStatement'),
    redirectUris: varchar('redirectUris', { length: 191 }).notNull(),
    postLogoutRedirectUris: varchar('postLogoutRedirectUris', { length: 191 }),
    backchannelLogoutUri: text('backchannelLogoutUri'),
    backchannelLogoutSessionRequired: boolean('backchannelLogoutSessionRequired'),
    tokenEndpointAuthMethod: text('tokenEndpointAuthMethod'),
    applicationType: text('applicationType'),
    jwks: text('jwks'),
    jwksUri: text('jwksUri'),
    grantTypes: varchar('grantTypes', { length: 191 }),
    responseTypes: varchar('responseTypes', { length: 191 }),
    requirePKCE: boolean('requirePKCE'),
    dpopBoundAccessTokens: boolean('dpopBoundAccessTokens').default(false),
    referenceId: text('referenceId'),
    metadata: varchar('metadata', { length: 191 }),
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

export const oauthResource = mysqlTable(
  'oauthResource',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    identifier: varchar('identifier', { length: 191 }).notNull(),
    name: text('name').notNull(),
    accessTokenTtl: int('accessTokenTtl'),
    refreshTokenTtl: int('refreshTokenTtl'),
    signingAlgorithm: text('signingAlgorithm'),
    signingKeyId: text('signingKeyId'),
    allowedScopes: varchar('allowedScopes', { length: 191 }),
    customClaims: varchar('customClaims', { length: 191 }),
    dpopBoundAccessTokensRequired: boolean('dpopBoundAccessTokensRequired').default(false),
    disabled: boolean('disabled').default(false),
    createdAt: datetime('createdAt', { fsp: 3 }),
    updatedAt: datetime('updatedAt', { fsp: 3 }),
    policyVersion: int('policyVersion').default(1),
    metadata: varchar('metadata', { length: 191 }),
  },
  (table) => [unique('oauthResource_identifier_key').on(table.identifier)],
)

export const oauthClientResource = mysqlTable(
  'oauthClientResource',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    clientId: varchar('clientId', { length: 191 }).notNull(),
    resourceId: varchar('resourceId', { length: 191 }).notNull(),
    metadata: varchar('metadata', { length: 191 }),
    createdAt: datetime('createdAt', { fsp: 3 }),
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

export const oauthRefreshToken = mysqlTable(
  'oauthRefreshToken',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    token: varchar('token', { length: 191 }).notNull(),
    clientId: varchar('clientId', { length: 191 }).notNull(),
    sessionId: varchar('sessionId', { length: 191 }),
    userId: varchar('userId', { length: 191 }).notNull(),
    referenceId: text('referenceId'),
    authorizationCodeId: text('authorizationCodeId'),
    resources: varchar('resources', { length: 191 }),
    requestedUserInfoClaims: varchar('requestedUserInfoClaims', { length: 191 }),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    revoked: datetime('revoked', { fsp: 3 }),
    rotatedAt: datetime('rotatedAt', { fsp: 3 }),
    rotationReplayResponse: text('rotationReplayResponse'),
    rotationReplayExpiresAt: datetime('rotationReplayExpiresAt', { fsp: 3 }),
    authTime: datetime('authTime', { fsp: 3 }),
    confirmation: varchar('confirmation', { length: 191 }),
    scopes: varchar('scopes', { length: 191 }).notNull(),
  },
  (table) => [
    index('oauthRefreshToken_clientId_idx').on(table.clientId),
    index('oauthRefreshToken_sessionId_idx').on(table.sessionId),
    index('oauthRefreshToken_userId_idx').on(table.userId),
    index('oauthRefreshToken_authorizationCodeId_idx').on(sql`${table.authorizationCodeId}(191)`),
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

export const oauthAccessToken = mysqlTable(
  'oauthAccessToken',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    token: varchar('token', { length: 191 }).notNull(),
    clientId: varchar('clientId', { length: 191 }).notNull(),
    sessionId: varchar('sessionId', { length: 191 }),
    userId: varchar('userId', { length: 191 }),
    referenceId: text('referenceId'),
    authorizationCodeId: text('authorizationCodeId'),
    resources: varchar('resources', { length: 191 }),
    requestedUserInfoClaims: varchar('requestedUserInfoClaims', { length: 191 }),
    refreshId: varchar('refreshId', { length: 191 }),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    revoked: datetime('revoked', { fsp: 3 }),
    confirmation: varchar('confirmation', { length: 191 }),
    scopes: varchar('scopes', { length: 191 }).notNull(),
  },
  (table) => [
    index('oauthAccessToken_clientId_idx').on(table.clientId),
    index('oauthAccessToken_sessionId_idx').on(table.sessionId),
    index('oauthAccessToken_userId_idx').on(table.userId),
    index('oauthAccessToken_authorizationCodeId_idx').on(sql`${table.authorizationCodeId}(191)`),
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

export const oauthConsent = mysqlTable(
  'oauthConsent',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    clientId: varchar('clientId', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }),
    referenceId: text('referenceId'),
    resources: varchar('resources', { length: 191 }),
    requestedUserInfoClaims: varchar('requestedUserInfoClaims', { length: 191 }),
    scopes: varchar('scopes', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
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

export const oauthClientAssertion = mysqlTable('oauthClientAssertion', {
  id: varchar('id', { length: 191 }).primaryKey(),
  expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
})

export const deviceCode = mysqlTable(
  'deviceCode',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    deviceCode: varchar('deviceCode', { length: 191 }).notNull(),
    userCode: varchar('userCode', { length: 191 }).notNull(),
    userId: text('userId'),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    status: text('status').notNull(),
    lastPolledAt: datetime('lastPolledAt', { fsp: 3 }),
    pollingInterval: int('pollingInterval'),
    clientId: text('clientId'),
    scope: text('scope'),
  },
  (table) => [
    uniqueIndex('deviceCode_deviceCode_uidx').on(table.deviceCode),
    uniqueIndex('deviceCode_userCode_uidx').on(table.userCode),
  ],
)

export const ssoProvider = mysqlTable(
  'ssoProvider',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    issuer: text('issuer').notNull(),
    oidcConfig: text('oidcConfig'),
    samlConfig: text('samlConfig'),
    userId: varchar('userId', { length: 191 }).notNull(),
    providerId: varchar('providerId', { length: 191 }).notNull(),
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

export const scimManagedConnection = mysqlTable(
  'scimManagedConnection',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    creationRequestId: varchar('creationRequestId', { length: 191 }).notNull(),
    connectionId: varchar('connectionId', { length: 191 }).notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    status: text('status').notNull(),
    revision: int('revision').notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    createdBy: text('createdBy').notNull(),
    decommissionStartedAt: datetime('decommissionStartedAt', { fsp: 3 }),
    decommissionStartedBy: text('decommissionStartedBy'),
    decommissionedAt: datetime('decommissionedAt', { fsp: 3 }),
    decommissionedBy: text('decommissionedBy'),
  },
  (table) => [
    index('scimManagedConnection_provisioningDomainId_idx').on(
      sql`${table.provisioningDomainId}(191)`,
    ),
    uniqueIndex('scimManagedConnection_creationRequestId_key').on(table.creationRequestId),
    uniqueIndex('scimManagedConnection_connectionId_key').on(table.connectionId),
  ],
)

export const scimManagedCredential = mysqlTable(
  'scimManagedCredential',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    connectionRecordId: varchar('connectionRecordId', { length: 191 }).notNull(),
    credentialId: varchar('credentialId', { length: 191 }).notNull(),
    tokenDigest: text('tokenDigest').notNull(),
    hashVersion: text('hashVersion').notNull(),
    activeSlotKey: varchar('activeSlotKey', { length: 191 }).notNull(),
    status: text('status').notNull(),
    serializedScopes: text('serializedScopes').notNull(),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    createdBy: text('createdBy').notNull(),
    lastUsedAt: datetime('lastUsedAt', { fsp: 3 }),
    revokedAt: datetime('revokedAt', { fsp: 3 }),
    revokedBy: text('revokedBy'),
    decommissionedAt: datetime('decommissionedAt', { fsp: 3 }),
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

export const scimManagedConnectionEvent = mysqlTable(
  'scimManagedConnectionEvent',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    connectionRecordId: varchar('connectionRecordId', { length: 191 }).notNull(),
    eventKey: varchar('eventKey', { length: 191 }).notNull(),
    sequence: int('sequence').notNull(),
    type: text('type').notNull(),
    actorId: text('actorId').notNull(),
    credentialId: text('credentialId'),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
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

export const scimConnectionBinding = mysqlTable(
  'scimConnectionBinding',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    connectionId: text('connectionId').notNull(),
    connectionKey: varchar('connectionKey', { length: 191 }).notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    decommissionedAt: datetime('decommissionedAt', { fsp: 3 }),
    decommissionStatus: text('decommissionStatus').notNull(),
    decommissionCursorUserId: text('decommissionCursorUserId'),
    decommissionReconciledUserCount: int('decommissionReconciledUserCount').notNull().default(0),
    decommissionBatchCount: int('decommissionBatchCount').notNull().default(0),
    decommissionRevision: int('decommissionRevision').notNull().default(0),
    decommissionCompletedAt: datetime('decommissionCompletedAt', { fsp: 3 }),
    decommissionLeaseId: text('decommissionLeaseId'),
    decommissionLeaseExpiresAt: datetime('decommissionLeaseExpiresAt', { fsp: 3 }),
  },
  (table) => [
    index('scimConnectionBinding_connectionId_idx').on(sql`${table.connectionId}(191)`),
    uniqueIndex('scimConnectionBinding_connectionKey_key').on(table.connectionKey),
  ],
)

export const scimIdentityTombstone = mysqlTable(
  'scimIdentityTombstone',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    externalId: text('externalId').notNull(),
    externalIdKey: varchar('externalIdKey', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }).notNull(),
    profile: text('profile').notNull(),
    deletedAt: datetime('deletedAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('scimIdentityTombstone_connectionId_idx').on(sql`${table.connectionId}(191)`),
    index('scimIdentityTombstone_provisioningDomainId_idx').on(
      sql`${table.provisioningDomainId}(191)`,
    ),
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

export const scimSubject = mysqlTable(
  'scimSubject',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    userId: varchar('userId', { length: 191 }).notNull(),
    profileSourceId: text('profileSourceId'),
    revision: int('revision').notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('scimSubject_profileSourceId_idx').on(sql`${table.profileSourceId}(191)`),
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

export const scimUser = mysqlTable(
  'scimUser',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    userId: varchar('userId', { length: 191 }).notNull(),
    connectionUserKey: varchar('connectionUserKey', { length: 191 }).notNull(),
    userName: text('userName').notNull(),
    userNameKey: varchar('userNameKey', { length: 191 }).notNull(),
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
    externalIdKey: varchar('externalIdKey', { length: 191 }),
    active: boolean('active').notNull(),
    orderKey: varchar('orderKey', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('scimUser_connectionId_idx').on(sql`${table.connectionId}(191)`),
    index('scimUser_provisioningDomainId_idx').on(sql`${table.provisioningDomainId}(191)`),
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

export const scimProjectionGrant = mysqlTable(
  'scimProjectionGrant',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    scimUserId: varchar('scimUserId', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }).notNull(),
    sourceKind: text('sourceKind').notNull(),
    sourceId: text('sourceId').notNull(),
    sourceValue: text('sourceValue'),
    role: text('role').notNull(),
    grantKey: varchar('grantKey', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('scimProjectionGrant_connectionId_idx').on(sql`${table.connectionId}(191)`),
    index('scimProjectionGrant_provisioningDomainId_idx').on(
      sql`${table.provisioningDomainId}(191)`,
    ),
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

export const scimGroup = mysqlTable(
  'scimGroup',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    revision: int('revision').notNull().default(0),
    displayName: text('displayName').notNull(),
    displayNameKey: varchar('displayNameKey', { length: 191 }).notNull(),
    externalId: text('externalId'),
    externalIdKey: varchar('externalIdKey', { length: 191 }),
    orderKey: varchar('orderKey', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('scimGroup_connectionId_idx').on(sql`${table.connectionId}(191)`),
    index('scimGroup_provisioningDomainId_idx').on(sql`${table.provisioningDomainId}(191)`),
    uniqueIndex('scimGroup_displayNameKey_key').on(table.displayNameKey),
    uniqueIndex('scimGroup_externalIdKey_key').on(table.externalIdKey),
    uniqueIndex('scimGroup_orderKey_key').on(table.orderKey),
  ],
)

export const scimGroupMember = mysqlTable(
  'scimGroupMember',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    connectionId: text('connectionId').notNull(),
    groupId: varchar('groupId', { length: 191 }).notNull(),
    scimUserId: varchar('scimUserId', { length: 191 }).notNull(),
    membershipKey: varchar('membershipKey', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('scimGroupMember_connectionId_idx').on(sql`${table.connectionId}(191)`),
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

export const walletAddress = mysqlTable(
  'walletAddress',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    userId: varchar('userId', { length: 191 }).notNull(),
    address: text('address').notNull(),
    chainId: int('chainId').notNull(),
    isPrimary: boolean('isPrimary').notNull().default(false),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
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

export const subscription = mysqlTable('subscription', {
  id: varchar('id', { length: 191 }).primaryKey(),
  plan: text('plan').notNull(),
  referenceId: text('referenceId').notNull(),
  stripeCustomerId: text('stripeCustomerId'),
  stripeSubscriptionId: text('stripeSubscriptionId'),
  status: text('status').notNull(),
  periodStart: datetime('periodStart', { fsp: 3 }),
  periodEnd: datetime('periodEnd', { fsp: 3 }),
  trialStart: datetime('trialStart', { fsp: 3 }),
  trialEnd: datetime('trialEnd', { fsp: 3 }),
  cancelAtPeriodEnd: boolean('cancelAtPeriodEnd').default(false),
  cancelAt: datetime('cancelAt', { fsp: 3 }),
  canceledAt: datetime('canceledAt', { fsp: 3 }),
  endedAt: datetime('endedAt', { fsp: 3 }),
  seats: int('seats'),
  billingInterval: text('billingInterval'),
  stripeScheduleId: text('stripeScheduleId'),
})

export const rateLimit = mysqlTable(
  'rateLimit',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    key: varchar('key', { length: 191 }).notNull(),
    count: int('count').notNull(),
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
