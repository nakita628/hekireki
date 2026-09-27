import {
  blob,
  customType,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

const utcDateTime = customType<{ data: Date; driverData: string | number }>({
  dataType: () => 'datetime',
  toDriver: (value) => value.toISOString().replace('Z', '+00:00'),
  fromDriver: (value) => {
    if (typeof value === 'number' || /^-?\d+$/u.test(value)) return new Date(Number(value))
    const iso = value.replace(' ', 'T').replace(/ (?=[+-]\d\d:?\d\d$)/u, '')
    return new Date(/T[\d:.]+$/u.test(iso) ? `${iso}Z` : iso)
  },
})

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

export const user = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
    updatedAt: utcDateTime('updatedAt').notNull().$onUpdate(utcNow),
    username: text('username'),
    displayUsername: text('displayUsername'),
    isAnonymous: integer('isAnonymous', { mode: 'boolean' }).default(false),
    phoneNumber: text('phoneNumber'),
    phoneNumberVerified: integer('phoneNumberVerified', { mode: 'boolean' }),
    twoFactorEnabled: integer('twoFactorEnabled', { mode: 'boolean' }).default(false),
    role: text('role'),
    banned: integer('banned', { mode: 'boolean' }).default(false),
    banReason: text('banReason'),
    banExpires: utcDateTime('banExpires'),
    lastLoginMethod: text('lastLoginMethod'),
    stripeCustomerId: text('stripeCustomerId'),
  },
  (table) => [
    uniqueIndex('user_email_key').on(table.email),
    uniqueIndex('user_username_key').on(table.username),
    uniqueIndex('user_phoneNumber_key').on(table.phoneNumber),
  ],
)

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: utcDateTime('expiresAt').notNull(),
    token: text('token').notNull(),
    createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
    updatedAt: utcDateTime('updatedAt').notNull().$onUpdate(utcNow),
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

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId').notNull(),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: utcDateTime('accessTokenExpiresAt'),
    refreshTokenExpiresAt: utcDateTime('refreshTokenExpiresAt'),
    scope: text('scope'),
    password: text('password'),
    createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
    updatedAt: utcDateTime('updatedAt').notNull().$onUpdate(utcNow),
  },
  (table) => [
    index('account_userId_idx').on(table.userId),
    foreignKey({ name: 'account_userId_fkey', columns: [table.userId], foreignColumns: [user.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: utcDateTime('expiresAt').notNull(),
    createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
    updatedAt: utcDateTime('updatedAt').notNull().$onUpdate(utcNow),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const twoFactor = sqliteTable(
  'twoFactor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backupCodes').notNull(),
    userId: text('userId').notNull(),
    verified: integer('verified', { mode: 'boolean' }).default(true),
    failedVerificationCount: integer('failedVerificationCount').default(0),
    lockedUntil: utcDateTime('lockedUntil'),
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

export const passkey = sqliteTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('publicKey').notNull(),
    userId: text('userId').notNull(),
    credentialID: text('credentialID').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('deviceType').notNull(),
    backedUp: integer('backedUp', { mode: 'boolean' }).notNull(),
    transports: text('transports'),
    createdAt: utcDateTime('createdAt'),
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

export const apikey = sqliteTable(
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
    lastRefillAt: utcDateTime('lastRefillAt'),
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    rateLimitEnabled: integer('rateLimitEnabled', { mode: 'boolean' }).default(true),
    rateLimitTimeWindow: integer('rateLimitTimeWindow').default(86400000),
    rateLimitMax: integer('rateLimitMax').default(10),
    requestCount: integer('requestCount').default(0),
    remaining: integer('remaining'),
    lastRequest: utcDateTime('lastRequest'),
    expiresAt: utcDateTime('expiresAt'),
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => [
    index('apikey_configId_idx').on(table.configId),
    index('apikey_referenceId_idx').on(table.referenceId),
    index('apikey_key_idx').on(table.key),
  ],
)

export const organization = sqliteTable(
  'organization',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logo: text('logo'),
    createdAt: utcDateTime('createdAt').notNull(),
    metadata: text('metadata'),
  },
  (table) => [uniqueIndex('organization_slug_key').on(table.slug)],
)

export const organizationRole = sqliteTable(
  'organizationRole',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId').notNull(),
    role: text('role').notNull(),
    permission: text('permission').notNull(),
    createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
    updatedAt: utcDateTime('updatedAt').$onUpdate(utcNow),
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

export const team = sqliteTable(
  'team',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    memberCount: integer('memberCount').notNull().default(0),
    organizationId: text('organizationId').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').$onUpdate(utcNow),
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

export const teamMember = sqliteTable(
  'teamMember',
  {
    id: text('id').primaryKey(),
    teamId: text('teamId').notNull(),
    userId: text('userId').notNull(),
    membershipKey: text('membershipKey'),
    createdAt: utcDateTime('createdAt'),
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

export const member = sqliteTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId').notNull(),
    userId: text('userId').notNull(),
    role: text('role').notNull().default('member'),
    createdAt: utcDateTime('createdAt').notNull(),
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

export const invitation = sqliteTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId').notNull(),
    email: text('email').notNull(),
    role: text('role'),
    teamId: text('teamId'),
    status: text('status').notNull().default('pending'),
    expiresAt: utcDateTime('expiresAt').notNull(),
    createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
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

export const jwks = sqliteTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('publicKey').notNull(),
  privateKey: text('privateKey').notNull(),
  createdAt: utcDateTime('createdAt').notNull(),
  expiresAt: utcDateTime('expiresAt'),
  alg: text('alg'),
  crv: text('crv'),
})

export const oauthClient = sqliteTable(
  'oauthClient',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId').notNull(),
    clientSecret: text('clientSecret'),
    clientDiscoveryId: text('clientDiscoveryId'),
    disabled: integer('disabled', { mode: 'boolean' }).default(false),
    skipConsent: integer('skipConsent', { mode: 'boolean' }),
    enableEndSession: integer('enableEndSession', { mode: 'boolean' }),
    subjectType: text('subjectType'),
    scopes: text('scopes'),
    clientCredentialsScopes: text('clientCredentialsScopes').default('[]'),
    userId: text('userId'),
    createdAt: utcDateTime('createdAt'),
    updatedAt: utcDateTime('updatedAt'),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts'),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('softwareId'),
    softwareVersion: text('softwareVersion'),
    softwareStatement: text('softwareStatement'),
    redirectUris: text('redirectUris').notNull(),
    postLogoutRedirectUris: text('postLogoutRedirectUris'),
    backchannelLogoutUri: text('backchannelLogoutUri'),
    backchannelLogoutSessionRequired: integer('backchannelLogoutSessionRequired', {
      mode: 'boolean',
    }),
    tokenEndpointAuthMethod: text('tokenEndpointAuthMethod'),
    applicationType: text('applicationType'),
    jwks: text('jwks'),
    jwksUri: text('jwksUri'),
    grantTypes: text('grantTypes'),
    responseTypes: text('responseTypes'),
    requirePKCE: integer('requirePKCE', { mode: 'boolean' }),
    dpopBoundAccessTokens: integer('dpopBoundAccessTokens', { mode: 'boolean' }).default(false),
    referenceId: text('referenceId'),
    metadata: text('metadata'),
  },
  (table) => [
    index('oauthClient_userId_idx').on(table.userId),
    uniqueIndex('oauthClient_clientId_key').on(table.clientId),
    foreignKey({
      name: 'oauthClient_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const oauthResource = sqliteTable(
  'oauthResource',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    name: text('name').notNull(),
    accessTokenTtl: integer('accessTokenTtl'),
    refreshTokenTtl: integer('refreshTokenTtl'),
    signingAlgorithm: text('signingAlgorithm'),
    signingKeyId: text('signingKeyId'),
    allowedScopes: text('allowedScopes'),
    customClaims: text('customClaims'),
    dpopBoundAccessTokensRequired: integer('dpopBoundAccessTokensRequired', {
      mode: 'boolean',
    }).default(false),
    disabled: integer('disabled', { mode: 'boolean' }).default(false),
    createdAt: utcDateTime('createdAt'),
    updatedAt: utcDateTime('updatedAt'),
    policyVersion: integer('policyVersion').default(1),
    metadata: text('metadata'),
  },
  (table) => [uniqueIndex('oauthResource_identifier_key').on(table.identifier)],
)

export const oauthClientResource = sqliteTable(
  'oauthClientResource',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId').notNull(),
    resourceId: text('resourceId').notNull(),
    metadata: text('metadata'),
    createdAt: utcDateTime('createdAt'),
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

export const oauthRefreshToken = sqliteTable(
  'oauthRefreshToken',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    clientId: text('clientId').notNull(),
    sessionId: text('sessionId'),
    userId: text('userId').notNull(),
    referenceId: text('referenceId'),
    authorizationCodeId: text('authorizationCodeId'),
    resources: text('resources'),
    requestedUserInfoClaims: text('requestedUserInfoClaims'),
    expiresAt: utcDateTime('expiresAt').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    revoked: utcDateTime('revoked'),
    rotatedAt: utcDateTime('rotatedAt'),
    rotationReplayResponse: text('rotationReplayResponse'),
    rotationReplayExpiresAt: utcDateTime('rotationReplayExpiresAt'),
    authTime: utcDateTime('authTime'),
    confirmation: text('confirmation'),
    scopes: text('scopes').notNull(),
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

export const oauthAccessToken = sqliteTable(
  'oauthAccessToken',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    clientId: text('clientId').notNull(),
    sessionId: text('sessionId'),
    userId: text('userId'),
    referenceId: text('referenceId'),
    authorizationCodeId: text('authorizationCodeId'),
    resources: text('resources'),
    requestedUserInfoClaims: text('requestedUserInfoClaims'),
    refreshId: text('refreshId'),
    expiresAt: utcDateTime('expiresAt').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    revoked: utcDateTime('revoked'),
    confirmation: text('confirmation'),
    scopes: text('scopes').notNull(),
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

export const oauthConsent = sqliteTable(
  'oauthConsent',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId').notNull(),
    userId: text('userId'),
    referenceId: text('referenceId'),
    resources: text('resources'),
    requestedUserInfoClaims: text('requestedUserInfoClaims'),
    scopes: text('scopes').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
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

export const oauthClientAssertion = sqliteTable('oauthClientAssertion', {
  id: text('id').primaryKey(),
  expiresAt: utcDateTime('expiresAt').notNull(),
})

export const deviceCode = sqliteTable(
  'deviceCode',
  {
    id: text('id').primaryKey(),
    deviceCode: text('deviceCode').notNull(),
    userCode: text('userCode').notNull(),
    userId: text('userId'),
    expiresAt: utcDateTime('expiresAt').notNull(),
    status: text('status').notNull(),
    lastPolledAt: utcDateTime('lastPolledAt'),
    pollingInterval: integer('pollingInterval'),
    clientId: text('clientId'),
    scope: text('scope'),
  },
  (table) => [
    uniqueIndex('deviceCode_deviceCode_uidx').on(table.deviceCode),
    uniqueIndex('deviceCode_userCode_uidx').on(table.userCode),
  ],
)

export const ssoProvider = sqliteTable(
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

export const scimManagedConnection = sqliteTable(
  'scimManagedConnection',
  {
    id: text('id').primaryKey(),
    creationRequestId: text('creationRequestId').notNull(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    status: text('status').notNull(),
    revision: integer('revision').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    createdBy: text('createdBy').notNull(),
    decommissionStartedAt: utcDateTime('decommissionStartedAt'),
    decommissionStartedBy: text('decommissionStartedBy'),
    decommissionedAt: utcDateTime('decommissionedAt'),
    decommissionedBy: text('decommissionedBy'),
  },
  (table) => [
    index('scimManagedConnection_provisioningDomainId_idx').on(table.provisioningDomainId),
    uniqueIndex('scimManagedConnection_creationRequestId_key').on(table.creationRequestId),
    uniqueIndex('scimManagedConnection_connectionId_key').on(table.connectionId),
  ],
)

export const scimManagedCredential = sqliteTable(
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
    expiresAt: utcDateTime('expiresAt').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    createdBy: text('createdBy').notNull(),
    lastUsedAt: utcDateTime('lastUsedAt'),
    revokedAt: utcDateTime('revokedAt'),
    revokedBy: text('revokedBy'),
    decommissionedAt: utcDateTime('decommissionedAt'),
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

export const scimManagedConnectionEvent = sqliteTable(
  'scimManagedConnectionEvent',
  {
    id: text('id').primaryKey(),
    connectionRecordId: text('connectionRecordId').notNull(),
    eventKey: text('eventKey').notNull(),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    actorId: text('actorId').notNull(),
    credentialId: text('credentialId'),
    createdAt: utcDateTime('createdAt').notNull(),
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

export const scimConnectionBinding = sqliteTable(
  'scimConnectionBinding',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    connectionKey: text('connectionKey').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    decommissionedAt: utcDateTime('decommissionedAt'),
    decommissionStatus: text('decommissionStatus').notNull().default('active'),
    decommissionCursorUserId: text('decommissionCursorUserId'),
    decommissionReconciledUserCount: integer('decommissionReconciledUserCount')
      .notNull()
      .default(0),
    decommissionBatchCount: integer('decommissionBatchCount').notNull().default(0),
    decommissionRevision: integer('decommissionRevision').notNull().default(0),
    decommissionCompletedAt: utcDateTime('decommissionCompletedAt'),
    decommissionLeaseId: text('decommissionLeaseId'),
    decommissionLeaseExpiresAt: utcDateTime('decommissionLeaseExpiresAt'),
  },
  (table) => [
    index('scimConnectionBinding_connectionId_idx').on(table.connectionId),
    uniqueIndex('scimConnectionBinding_connectionKey_key').on(table.connectionKey),
  ],
)

export const scimIdentityTombstone = sqliteTable(
  'scimIdentityTombstone',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    externalId: text('externalId').notNull(),
    externalIdKey: text('externalIdKey').notNull(),
    userId: text('userId').notNull(),
    profile: text('profile').notNull(),
    deletedAt: utcDateTime('deletedAt').notNull(),
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

export const scimSubject = sqliteTable(
  'scimSubject',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    profileSourceId: text('profileSourceId'),
    revision: integer('revision').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
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

export const scimUser = sqliteTable(
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
    active: integer('active', { mode: 'boolean' }).notNull(),
    orderKey: text('orderKey').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
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

export const scimProjectionGrant = sqliteTable(
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
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
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

export const scimGroup = sqliteTable(
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
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
  },
  (table) => [
    index('scimGroup_connectionId_idx').on(table.connectionId),
    index('scimGroup_provisioningDomainId_idx').on(table.provisioningDomainId),
    uniqueIndex('scimGroup_displayNameKey_key').on(table.displayNameKey),
    uniqueIndex('scimGroup_externalIdKey_key').on(table.externalIdKey),
    uniqueIndex('scimGroup_orderKey_key').on(table.orderKey),
  ],
)

export const scimGroupMember = sqliteTable(
  'scimGroupMember',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    groupId: text('groupId').notNull(),
    scimUserId: text('scimUserId').notNull(),
    membershipKey: text('membershipKey').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
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

export const walletAddress = sqliteTable(
  'walletAddress',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    address: text('address').notNull(),
    chainId: integer('chainId').notNull(),
    isPrimary: integer('isPrimary', { mode: 'boolean' }).notNull().default(false),
    createdAt: utcDateTime('createdAt').notNull(),
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

export const subscription = sqliteTable('subscription', {
  id: text('id').primaryKey(),
  plan: text('plan').notNull(),
  referenceId: text('referenceId').notNull(),
  stripeCustomerId: text('stripeCustomerId'),
  stripeSubscriptionId: text('stripeSubscriptionId'),
  status: text('status').notNull().default('incomplete'),
  periodStart: utcDateTime('periodStart'),
  periodEnd: utcDateTime('periodEnd'),
  trialStart: utcDateTime('trialStart'),
  trialEnd: utcDateTime('trialEnd'),
  cancelAtPeriodEnd: integer('cancelAtPeriodEnd', { mode: 'boolean' }).default(false),
  cancelAt: utcDateTime('cancelAt'),
  canceledAt: utcDateTime('canceledAt'),
  endedAt: utcDateTime('endedAt'),
  seats: integer('seats'),
  billingInterval: text('billingInterval'),
  stripeScheduleId: text('stripeScheduleId'),
})

export const rateLimit = sqliteTable(
  'rateLimit',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    count: integer('count').notNull(),
    lastRequest: blob('lastRequest', { mode: 'bigint' }).notNull(),
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
