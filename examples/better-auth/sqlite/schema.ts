import {
  blob,
  customType,
  index,
  integer,
  sqliteTable,
  text,
  unique,
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

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
  updatedAt: utcDateTime('updatedAt').notNull().$onUpdate(utcNow),
  username: text('username').unique(),
  displayUsername: text('displayUsername'),
  isAnonymous: integer('isAnonymous', { mode: 'boolean' }).default(false),
  phoneNumber: text('phoneNumber').unique(),
  phoneNumberVerified: integer('phoneNumberVerified', { mode: 'boolean' }),
  twoFactorEnabled: integer('twoFactorEnabled', { mode: 'boolean' }).default(false),
  role: text('role'),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('banReason'),
  banExpires: utcDateTime('banExpires'),
  lastLoginMethod: text('lastLoginMethod'),
  stripeCustomerId: text('stripeCustomerId'),
})

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: utcDateTime('expiresAt').notNull(),
    token: text('token').notNull().unique(),
    createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
    updatedAt: utcDateTime('updatedAt').notNull().$onUpdate(utcNow),
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

export const account = sqliteTable(
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
    accessTokenExpiresAt: utcDateTime('accessTokenExpiresAt'),
    refreshTokenExpiresAt: utcDateTime('refreshTokenExpiresAt'),
    scope: text('scope'),
    password: text('password'),
    createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
    updatedAt: utcDateTime('updatedAt').notNull().$onUpdate(utcNow),
  },
  (table) => [index('idx_account_userId').on(table.userId)],
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
  (table) => [index('idx_verification_identifier').on(table.identifier)],
)

export const twoFactor = sqliteTable(
  'twoFactor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backupCodes').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: integer('verified', { mode: 'boolean' }).default(true),
    failedVerificationCount: integer('failedVerificationCount').default(0),
    lockedUntil: utcDateTime('lockedUntil'),
  },
  (table) => [
    index('idx_twoFactor_secret').on(table.secret),
    index('idx_twoFactor_userId').on(table.userId),
  ],
)

export const passkey = sqliteTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('publicKey').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credentialID').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('deviceType').notNull(),
    backedUp: integer('backedUp', { mode: 'boolean' }).notNull(),
    transports: text('transports'),
    createdAt: utcDateTime('createdAt'),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('idx_passkey_userId').on(table.userId),
    index('idx_passkey_credentialID').on(table.credentialID),
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
    index('idx_apikey_configId').on(table.configId),
    index('idx_apikey_referenceId').on(table.referenceId),
    index('idx_apikey_key').on(table.key),
  ],
)

export const organization = sqliteTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: utcDateTime('createdAt').notNull(),
  metadata: text('metadata'),
})

export const organizationRole = sqliteTable(
  'organizationRole',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    permission: text('permission').notNull(),
    createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
    updatedAt: utcDateTime('updatedAt').$onUpdate(utcNow),
  },
  (table) => [
    index('idx_organizationRole_organizationId').on(table.organizationId),
    index('idx_organizationRole_role').on(table.role),
  ],
)

export const team = sqliteTable(
  'team',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    memberCount: integer('memberCount').notNull().default(0),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').$onUpdate(utcNow),
  },
  (table) => [index('idx_team_organizationId').on(table.organizationId)],
)

export const teamMember = sqliteTable(
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
    createdAt: utcDateTime('createdAt'),
  },
  (table) => [
    index('idx_teamMember_teamId').on(table.teamId),
    index('idx_teamMember_userId').on(table.userId),
  ],
)

export const member = sqliteTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: utcDateTime('createdAt').notNull(),
  },
  (table) => [
    index('idx_member_organizationId').on(table.organizationId),
    index('idx_member_userId').on(table.userId),
  ],
)

export const invitation = sqliteTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    teamId: text('teamId'),
    status: text('status').notNull().default('pending'),
    expiresAt: utcDateTime('expiresAt').notNull(),
    createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow),
    inviterId: text('inviterId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('idx_invitation_organizationId').on(table.organizationId),
    index('idx_invitation_email').on(table.email),
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
    clientId: text('clientId').notNull().unique(),
    clientSecret: text('clientSecret'),
    clientDiscoveryId: text('clientDiscoveryId'),
    disabled: integer('disabled', { mode: 'boolean' }).default(false),
    skipConsent: integer('skipConsent', { mode: 'boolean' }),
    enableEndSession: integer('enableEndSession', { mode: 'boolean' }),
    subjectType: text('subjectType'),
    scopes: text('scopes'),
    clientCredentialsScopes: text('clientCredentialsScopes').default('[]'),
    userId: text('userId').references(() => user.id, { onDelete: 'cascade' }),
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
  (table) => [index('idx_oauthClient_userId').on(table.userId)],
)

export const oauthResource = sqliteTable('oauthResource', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
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
})

export const oauthClientResource = sqliteTable(
  'oauthClientResource',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text('resourceId')
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: text('metadata'),
    createdAt: utcDateTime('createdAt'),
  },
  (table) => [
    unique('oauthClientResource_clientId_resourceId_uidx').on(table.clientId, table.resourceId),
    index('idx_oauthClientResource_clientId').on(table.clientId),
    index('idx_oauthClientResource_resourceId').on(table.resourceId),
  ],
)

export const oauthRefreshToken = sqliteTable(
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
    index('idx_oauthRefreshToken_clientId').on(table.clientId),
    index('idx_oauthRefreshToken_sessionId').on(table.sessionId),
    index('idx_oauthRefreshToken_userId').on(table.userId),
    index('idx_oauthRefreshToken_authorizationCodeId').on(table.authorizationCodeId),
  ],
)

export const oauthAccessToken = sqliteTable(
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
    expiresAt: utcDateTime('expiresAt').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    revoked: utcDateTime('revoked'),
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

export const oauthConsent = sqliteTable(
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
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
  },
  (table) => [
    index('idx_oauthConsent_clientId').on(table.clientId),
    index('idx_oauthConsent_userId').on(table.userId),
  ],
)

export const oauthClientAssertion = sqliteTable('oauthClientAssertion', {
  id: text('id').primaryKey(),
  expiresAt: utcDateTime('expiresAt').notNull(),
})

export const deviceCode = sqliteTable('deviceCode', {
  id: text('id').primaryKey(),
  deviceCode: text('deviceCode').notNull().unique(),
  userCode: text('userCode').notNull().unique(),
  userId: text('userId'),
  expiresAt: utcDateTime('expiresAt').notNull(),
  status: text('status').notNull(),
  lastPolledAt: utcDateTime('lastPolledAt'),
  pollingInterval: integer('pollingInterval'),
  clientId: text('clientId'),
  scope: text('scope'),
})

export const ssoProvider = sqliteTable('ssoProvider', {
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

export const scimManagedConnection = sqliteTable(
  'scimManagedConnection',
  {
    id: text('id').primaryKey(),
    creationRequestId: text('creationRequestId').notNull().unique(),
    connectionId: text('connectionId').notNull().unique(),
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
    index('idx_scimManagedConnection_provisioningDomainId').on(table.provisioningDomainId),
  ],
)

export const scimManagedCredential = sqliteTable(
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
    expiresAt: utcDateTime('expiresAt').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    createdBy: text('createdBy').notNull(),
    lastUsedAt: utcDateTime('lastUsedAt'),
    revokedAt: utcDateTime('revokedAt'),
    revokedBy: text('revokedBy'),
    decommissionedAt: utcDateTime('decommissionedAt'),
  },
  (table) => [index('idx_scimManagedCredential_connectionRecordId').on(table.connectionRecordId)],
)

export const scimManagedConnectionEvent = sqliteTable(
  'scimManagedConnectionEvent',
  {
    id: text('id').primaryKey(),
    connectionRecordId: text('connectionRecordId')
      .notNull()
      .references(() => scimManagedConnection.id, { onDelete: 'cascade' }),
    eventKey: text('eventKey').notNull().unique(),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    actorId: text('actorId').notNull(),
    credentialId: text('credentialId'),
    createdAt: utcDateTime('createdAt').notNull(),
  },
  (table) => [
    index('idx_scimManagedConnectionEvent_connectionRecordId').on(table.connectionRecordId),
  ],
)

export const scimConnectionBinding = sqliteTable(
  'scimConnectionBinding',
  {
    id: text('id').primaryKey(),
    connectionId: text('connectionId').notNull(),
    connectionKey: text('connectionKey').notNull().unique(),
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
  (table) => [index('idx_scimConnectionBinding_connectionId').on(table.connectionId)],
)

export const scimIdentityTombstone = sqliteTable(
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
    deletedAt: utcDateTime('deletedAt').notNull(),
  },
  (table) => [
    index('idx_scimIdentityTombstone_connectionId').on(table.connectionId),
    index('idx_scimIdentityTombstone_provisioningDomainId').on(table.provisioningDomainId),
    index('idx_scimIdentityTombstone_userId').on(table.userId),
  ],
)

export const scimSubject = sqliteTable(
  'scimSubject',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    profileSourceId: text('profileSourceId'),
    revision: integer('revision').notNull(),
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
  },
  (table) => [index('idx_scimSubject_profileSourceId').on(table.profileSourceId)],
)

export const scimUser = sqliteTable(
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
    active: integer('active', { mode: 'boolean' }).notNull(),
    orderKey: text('orderKey').notNull().unique(),
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
  },
  (table) => [
    index('idx_scimUser_connectionId').on(table.connectionId),
    index('idx_scimUser_provisioningDomainId').on(table.provisioningDomainId),
    index('idx_scimUser_userId').on(table.userId),
  ],
)

export const scimProjectionGrant = sqliteTable(
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
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
  },
  (table) => [
    index('idx_scimProjectionGrant_connectionId').on(table.connectionId),
    index('idx_scimProjectionGrant_provisioningDomainId').on(table.provisioningDomainId),
    index('idx_scimProjectionGrant_scimUserId').on(table.scimUserId),
    index('idx_scimProjectionGrant_userId').on(table.userId),
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
    displayNameKey: text('displayNameKey').notNull().unique(),
    externalId: text('externalId'),
    externalIdKey: text('externalIdKey').unique(),
    orderKey: text('orderKey').notNull().unique(),
    createdAt: utcDateTime('createdAt').notNull(),
    updatedAt: utcDateTime('updatedAt').notNull(),
  },
  (table) => [
    index('idx_scimGroup_connectionId').on(table.connectionId),
    index('idx_scimGroup_provisioningDomainId').on(table.provisioningDomainId),
  ],
)

export const scimGroupMember = sqliteTable(
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
    createdAt: utcDateTime('createdAt').notNull(),
  },
  (table) => [
    index('idx_scimGroupMember_connectionId').on(table.connectionId),
    index('idx_scimGroupMember_groupId').on(table.groupId),
    index('idx_scimGroupMember_scimUserId').on(table.scimUserId),
  ],
)

export const walletAddress = sqliteTable(
  'walletAddress',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    address: text('address').notNull(),
    chainId: integer('chainId').notNull(),
    isPrimary: integer('isPrimary', { mode: 'boolean' }).notNull().default(false),
    createdAt: utcDateTime('createdAt').notNull(),
  },
  (table) => [index('idx_walletAddress_userId').on(table.userId)],
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

export const rateLimit = sqliteTable('rateLimit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: blob('lastRequest', { mode: 'bigint' }).notNull(),
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
