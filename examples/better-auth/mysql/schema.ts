import {
  bigint,
  boolean,
  datetime,
  index,
  int,
  mysqlTable,
  text,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core'
import { relations, sql } from 'drizzle-orm'

// bigint() is exact past 2^53 only on a connection with supportBigNumbers and bigNumberStrings

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

export const user = mysqlTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: datetime('createdAt', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$defaultFn(utcNow),
  updatedAt: datetime('updatedAt', { fsp: 3 }).notNull().$onUpdate(utcNow),
  username: text('username').unique(),
  displayUsername: text('displayUsername'),
  isAnonymous: boolean('isAnonymous').default(false),
  phoneNumber: text('phoneNumber').unique(),
  phoneNumberVerified: boolean('phoneNumberVerified'),
  twoFactorEnabled: boolean('twoFactorEnabled').default(false),
  role: text('role'),
  banned: boolean('banned').default(false),
  banReason: text('banReason'),
  banExpires: datetime('banExpires', { fsp: 3 }),
  lastLoginMethod: text('lastLoginMethod'),
  stripeCustomerId: text('stripeCustomerId'),
})

export const session = mysqlTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: datetime('createdAt', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$defaultFn(utcNow),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull().$onUpdate(utcNow),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonatedBy'),
    activeOrganizationId: text('activeOrganizationId'),
    activeTeamId: text('activeTeamId'),
  },
  (table) => [index('idx_session_userId').on(table.userId)],
)

export const account = mysqlTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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
  (table) => [index('idx_account_userId').on(table.userId)],
)

export const verification = mysqlTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$defaultFn(utcNow),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull().$onUpdate(utcNow),
  },
  (table) => [index('idx_verification_identifier').on(table.identifier)],
)

export const twoFactor = mysqlTable(
  'twoFactor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backupCodes').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean('verified').default(true),
    failedVerificationCount: int('failedVerificationCount').default(0),
    lockedUntil: datetime('lockedUntil', { fsp: 3 }),
  },
  (table) => [
    index('idx_twoFactor_secret').on(table.secret),
    index('idx_twoFactor_userId').on(table.userId),
  ],
)

export const passkey = mysqlTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('publicKey').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credentialID').notNull(),
    counter: int('counter').notNull(),
    deviceType: text('deviceType').notNull(),
    backedUp: boolean('backedUp').notNull(),
    transports: text('transports'),
    createdAt: datetime('createdAt', { fsp: 3 }),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('idx_passkey_userId').on(table.userId),
    index('idx_passkey_credentialID').on(table.credentialID),
  ],
)

export const apikey = mysqlTable(
  'apikey',
  {
    id: text('id').primaryKey(),
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
    index('idx_apikey_configId').on(table.configId),
    index('idx_apikey_referenceId').on(table.referenceId),
    index('idx_apikey_key').on(table.key),
  ],
)

export const organization = mysqlTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
  metadata: text('metadata'),
})

export const organizationRole = mysqlTable(
  'organizationRole',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    permission: text('permission').notNull(),
    createdAt: datetime('createdAt', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$defaultFn(utcNow),
    updatedAt: datetime('updatedAt', { fsp: 3 }).$onUpdate(utcNow),
  },
  (table) => [
    index('idx_organizationRole_organizationId').on(table.organizationId),
    index('idx_organizationRole_role').on(table.role),
  ],
)

export const team = mysqlTable(
  'team',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    memberCount: int('memberCount').notNull().default(0),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).$onUpdate(utcNow),
  },
  (table) => [index('idx_team_organizationId').on(table.organizationId)],
)

export const teamMember = mysqlTable(
  'teamMember',
  {
    id: text('id').primaryKey(),
    teamId: text('teamId')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    membershipKey: text('membershipKey').unique(),
    createdAt: datetime('createdAt', { fsp: 3 }),
  },
  (table) => [
    index('idx_teamMember_teamId').on(table.teamId),
    index('idx_teamMember_userId').on(table.userId),
  ],
)

export const member = mysqlTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_member_organizationId').on(table.organizationId),
    index('idx_member_userId').on(table.userId),
  ],
)

export const invitation = mysqlTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    teamId: text('teamId'),
    status: text('status').notNull(),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$defaultFn(utcNow),
    inviterId: text('inviterId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('idx_invitation_organizationId').on(table.organizationId),
    index('idx_invitation_email').on(table.email),
  ],
)

export const jwks = mysqlTable('jwks', {
  id: text('id').primaryKey(),
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
    id: text('id').primaryKey(),
    clientId: text('clientId').notNull().unique(),
    clientSecret: text('clientSecret'),
    clientDiscoveryId: text('clientDiscoveryId'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skipConsent'),
    enableEndSession: boolean('enableEndSession'),
    subjectType: text('subjectType'),
    scopes: text('scopes'),
    clientCredentialsScopes: text('clientCredentialsScopes').default('[]'),
    userId: text('userId').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: datetime('createdAt', { fsp: 3 }),
    updatedAt: datetime('updatedAt', { fsp: 3 }),
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
    backchannelLogoutSessionRequired: boolean('backchannelLogoutSessionRequired'),
    tokenEndpointAuthMethod: text('tokenEndpointAuthMethod'),
    applicationType: text('applicationType'),
    jwks: text('jwks'),
    jwksUri: text('jwksUri'),
    grantTypes: text('grantTypes'),
    responseTypes: text('responseTypes'),
    requirePKCE: boolean('requirePKCE'),
    dpopBoundAccessTokens: boolean('dpopBoundAccessTokens').default(false),
    referenceId: text('referenceId'),
    metadata: text('metadata'),
  },
  (table) => [index('idx_oauthClient_userId').on(table.userId)],
)

export const oauthResource = mysqlTable('oauthResource', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: int('accessTokenTtl'),
  refreshTokenTtl: int('refreshTokenTtl'),
  signingAlgorithm: text('signingAlgorithm'),
  signingKeyId: text('signingKeyId'),
  allowedScopes: text('allowedScopes'),
  customClaims: text('customClaims'),
  dpopBoundAccessTokensRequired: boolean('dpopBoundAccessTokensRequired').default(false),
  disabled: boolean('disabled').default(false),
  createdAt: datetime('createdAt', { fsp: 3 }),
  updatedAt: datetime('updatedAt', { fsp: 3 }),
  policyVersion: int('policyVersion').default(1),
  metadata: text('metadata'),
})

export const oauthClientResource = mysqlTable(
  'oauthClientResource',
  {
    id: text('id').primaryKey(),
    clientId: varchar('clientId', { length: 191 })
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: varchar('resourceId', { length: 191 })
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: text('metadata'),
    createdAt: datetime('createdAt', { fsp: 3 }),
  },
  (table) => [
    unique('oauthClientResource_clientId_resourceId_uidx').on(table.clientId, table.resourceId),
    index('idx_oauthClientResource_clientId').on(table.clientId),
    index('idx_oauthClientResource_resourceId').on(table.resourceId),
  ],
)

export const oauthRefreshToken = mysqlTable(
  'oauthRefreshToken',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('clientId')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('sessionId').references(() => session.id, { onDelete: 'set null' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('referenceId'),
    authorizationCodeId: text('authorizationCodeId'),
    resources: text('resources'),
    requestedUserInfoClaims: text('requestedUserInfoClaims'),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    revoked: datetime('revoked', { fsp: 3 }),
    rotatedAt: datetime('rotatedAt', { fsp: 3 }),
    rotationReplayResponse: text('rotationReplayResponse'),
    rotationReplayExpiresAt: datetime('rotationReplayExpiresAt', { fsp: 3 }),
    authTime: datetime('authTime', { fsp: 3 }),
    confirmation: text('confirmation'),
    scopes: text('scopes').notNull(),
  },
  (table) => [
    index('idx_oauthRefreshToken_clientId').on(table.clientId),
    index('idx_oauthRefreshToken_sessionId').on(table.sessionId),
    index('idx_oauthRefreshToken_userId').on(table.userId),
    index('idx_oauthRefreshToken_authorizationCodeId').on(table.authorizationCodeId),
  ],
)

export const oauthAccessToken = mysqlTable(
  'oauthAccessToken',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('clientId')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('sessionId').references(() => session.id, { onDelete: 'set null' }),
    userId: text('userId').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('referenceId'),
    authorizationCodeId: text('authorizationCodeId'),
    resources: text('resources'),
    requestedUserInfoClaims: text('requestedUserInfoClaims'),
    refreshId: text('refreshId').references(() => oauthRefreshToken.id, { onDelete: 'cascade' }),
    expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    revoked: datetime('revoked', { fsp: 3 }),
    confirmation: text('confirmation'),
    scopes: text('scopes').notNull(),
  },
  (table) => [
    index('idx_oauthAccessToken_clientId').on(table.clientId),
    index('idx_oauthAccessToken_sessionId').on(table.sessionId),
    index('idx_oauthAccessToken_userId').on(table.userId),
    index('idx_oauthAccessToken_authorizationCodeId').on(table.authorizationCodeId),
    index('idx_oauthAccessToken_refreshId').on(table.refreshId),
  ],
)

export const oauthConsent = mysqlTable(
  'oauthConsent',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    userId: text('userId').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('referenceId'),
    resources: text('resources'),
    requestedUserInfoClaims: text('requestedUserInfoClaims'),
    scopes: text('scopes').notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_oauthConsent_clientId').on(table.clientId),
    index('idx_oauthConsent_userId').on(table.userId),
  ],
)

export const oauthClientAssertion = mysqlTable('oauthClientAssertion', {
  id: text('id').primaryKey(),
  expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
})

export const deviceCode = mysqlTable('deviceCode', {
  id: text('id').primaryKey(),
  deviceCode: varchar('deviceCode', { length: 191 }).notNull().unique(),
  userCode: varchar('userCode', { length: 191 }).notNull().unique(),
  userId: text('userId'),
  expiresAt: datetime('expiresAt', { fsp: 3 }).notNull(),
  status: text('status').notNull(),
  lastPolledAt: datetime('lastPolledAt', { fsp: 3 }),
  pollingInterval: int('pollingInterval'),
  clientId: text('clientId'),
  scope: text('scope'),
})

export const ssoProvider = mysqlTable('ssoProvider', {
  id: text('id').primaryKey(),
  issuer: text('issuer').notNull(),
  oidcConfig: text('oidcConfig'),
  samlConfig: text('samlConfig'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  providerId: text('providerId').notNull().unique(),
  organizationId: text('organizationId'),
  domain: text('domain').notNull(),
})

export const scimManagedConnection = mysqlTable(
  'scimManagedConnection',
  {
    id: text('id').primaryKey(),
    creationRequestId: text('creationRequestId').notNull().unique(),
    connectionId: text('connectionId').notNull().unique(),
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
    index('idx_scimManagedConnection_provisioningDomainId').on(table.provisioningDomainId),
  ],
)

export const scimManagedCredential = mysqlTable(
  'scimManagedCredential',
  {
    id: text('id').primaryKey(),
    connectionRecordId: text('connectionRecordId')
      .notNull()
      .references(() => scimManagedConnection.id, { onDelete: 'cascade' }),
    credentialId: text('credentialId').notNull().unique(),
    tokenDigest: text('tokenDigest').notNull(),
    hashVersion: text('hashVersion').notNull(),
    activeSlotKey: text('activeSlotKey').notNull().unique(),
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
  (table) => [index('idx_scimManagedCredential_connectionRecordId').on(table.connectionRecordId)],
)

export const scimManagedConnectionEvent = mysqlTable(
  'scimManagedConnectionEvent',
  {
    id: text('id').primaryKey(),
    connectionRecordId: text('connectionRecordId')
      .notNull()
      .references(() => scimManagedConnection.id, { onDelete: 'cascade' }),
    eventKey: text('eventKey').notNull().unique(),
    sequence: int('sequence').notNull(),
    type: text('type').notNull(),
    actorId: text('actorId').notNull(),
    credentialId: text('credentialId'),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_scimManagedConnectionEvent_connectionRecordId').on(table.connectionRecordId),
  ],
)

export const scimConnectionBinding = mysqlTable(
  'scimConnectionBinding',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    connectionKey: text('connectionKey').notNull().unique(),
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
  (table) => [index('idx_scimConnectionBinding_connectionId').on(table.connectionId)],
)

export const scimIdentityTombstone = mysqlTable(
  'scimIdentityTombstone',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    externalId: text('externalId').notNull(),
    externalIdKey: text('externalIdKey').notNull().unique(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    profile: text('profile').notNull(),
    deletedAt: datetime('deletedAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_scimIdentityTombstone_connectionId').on(table.connectionId),
    index('idx_scimIdentityTombstone_provisioningDomainId').on(table.provisioningDomainId),
    index('idx_scimIdentityTombstone_userId').on(table.userId),
  ],
)

export const scimSubject = mysqlTable(
  'scimSubject',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    profileSourceId: text('profileSourceId'),
    revision: int('revision').notNull(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
  },
  (table) => [index('idx_scimSubject_profileSourceId').on(table.profileSourceId)],
)

export const scimUser = mysqlTable(
  'scimUser',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    connectionUserKey: text('connectionUserKey').notNull().unique(),
    userName: text('userName').notNull(),
    userNameKey: text('userNameKey').notNull().unique(),
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
    externalIdKey: text('externalIdKey').unique(),
    active: boolean('active').notNull(),
    orderKey: text('orderKey').notNull().unique(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_scimUser_connectionId').on(table.connectionId),
    index('idx_scimUser_provisioningDomainId').on(table.provisioningDomainId),
    index('idx_scimUser_userId').on(table.userId),
  ],
)

export const scimProjectionGrant = mysqlTable(
  'scimProjectionGrant',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    scimUserId: text('scimUserId')
      .notNull()
      .references(() => scimUser.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sourceKind: text('sourceKind').notNull(),
    sourceId: text('sourceId').notNull(),
    sourceValue: text('sourceValue'),
    role: text('role').notNull(),
    grantKey: text('grantKey').notNull().unique(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_scimProjectionGrant_connectionId').on(table.connectionId),
    index('idx_scimProjectionGrant_provisioningDomainId').on(table.provisioningDomainId),
    index('idx_scimProjectionGrant_scimUserId').on(table.scimUserId),
    index('idx_scimProjectionGrant_userId').on(table.userId),
  ],
)

export const scimGroup = mysqlTable(
  'scimGroup',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    provisioningDomainId: text('provisioningDomainId').notNull(),
    revision: int('revision').notNull().default(0),
    displayName: text('displayName').notNull(),
    displayNameKey: text('displayNameKey').notNull().unique(),
    externalId: text('externalId'),
    externalIdKey: text('externalIdKey').unique(),
    orderKey: text('orderKey').notNull().unique(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
    updatedAt: datetime('updatedAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_scimGroup_connectionId').on(table.connectionId),
    index('idx_scimGroup_provisioningDomainId').on(table.provisioningDomainId),
  ],
)

export const scimGroupMember = mysqlTable(
  'scimGroupMember',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    groupId: text('groupId')
      .notNull()
      .references(() => scimGroup.id, { onDelete: 'cascade' }),
    scimUserId: text('scimUserId')
      .notNull()
      .references(() => scimUser.id, { onDelete: 'cascade' }),
    membershipKey: text('membershipKey').notNull().unique(),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_scimGroupMember_connectionId').on(table.connectionId),
    index('idx_scimGroupMember_groupId').on(table.groupId),
    index('idx_scimGroupMember_scimUserId').on(table.scimUserId),
  ],
)

export const walletAddress = mysqlTable(
  'walletAddress',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    address: text('address').notNull(),
    chainId: int('chainId').notNull(),
    isPrimary: boolean('isPrimary').notNull().default(false),
    createdAt: datetime('createdAt', { fsp: 3 }).notNull(),
  },
  (table) => [index('idx_walletAddress_userId').on(table.userId)],
)

export const subscription = mysqlTable('subscription', {
  id: text('id').primaryKey(),
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

export const rateLimit = mysqlTable('rateLimit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: int('count').notNull(),
  lastRequest: bigint('lastRequest', { mode: 'bigint' }).notNull(),
})

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
