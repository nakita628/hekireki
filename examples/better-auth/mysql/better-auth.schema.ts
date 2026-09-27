import { relations } from "drizzle-orm";
import {
  mysqlTable,
  varchar,
  text,
  bigint,
  timestamp,
  boolean,
  int,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const user = mysqlTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  username: varchar("username", { length: 255 }).unique(),
  displayUsername: text("display_username"),
  isAnonymous: boolean("is_anonymous").default(false),
  phoneNumber: varchar("phone_number", { length: 255 }).unique(),
  phoneNumberVerified: boolean("phone_number_verified"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { fsp: 3 }),
  lastLoginMethod: text("last_login_method"),
  stripeCustomerId: text("stripe_customer_id"),
});

export const session = mysqlTable(
  "session",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = mysqlTable(
  "account",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { fsp: 3 }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { fsp: 3 }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = mysqlTable(
  "verification",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const twoFactor = mysqlTable(
  "two_factor",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    secret: varchar("secret", { length: 255 }).notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: int("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { fsp: 3 }),
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId),
  ],
);

export const passkey = mysqlTable(
  "passkey",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: varchar("credential_id", { length: 255 }).notNull(),
    counter: int("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at", { fsp: 3 }),
    aaguid: text("aaguid"),
  },
  (table) => [
    index("passkey_userId_idx").on(table.userId),
    index("passkey_credentialID_idx").on(table.credentialID),
  ],
);

export const apikey = mysqlTable(
  "apikey",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    configId: varchar("config_id", { length: 255 })
      .default("default")
      .notNull(),
    name: text("name"),
    start: text("start"),
    referenceId: varchar("reference_id", { length: 255 }).notNull(),
    prefix: text("prefix"),
    key: varchar("key", { length: 255 }).notNull(),
    refillInterval: int("refill_interval"),
    refillAmount: int("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { fsp: 3 }),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: int("rate_limit_time_window").default(86400000),
    rateLimitMax: int("rate_limit_max").default(10),
    requestCount: int("request_count").default(0),
    remaining: int("remaining"),
    lastRequest: timestamp("last_request", { fsp: 3 }),
    expiresAt: timestamp("expires_at", { fsp: 3 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 }).notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_configId_idx").on(table.configId),
    index("apikey_referenceId_idx").on(table.referenceId),
    index("apikey_key_idx").on(table.key),
  ],
);

export const organization = mysqlTable("organization", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
  metadata: text("metadata"),
});

export const organizationRole = mysqlTable(
  "organization_role",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 255 }).notNull(),
    permission: text("permission").notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 }).$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [
    index("organizationRole_organizationId_idx").on(table.organizationId),
    index("organizationRole_role_idx").on(table.role),
  ],
);

export const team = mysqlTable(
  "team",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: text("name").notNull(),
    memberCount: int("member_count").default(0).notNull(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 }).$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [index("team_organizationId_idx").on(table.organizationId)],
);

export const teamMember = mysqlTable(
  "team_member",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    teamId: varchar("team_id", { length: 36 })
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    membershipKey: varchar("membership_key", { length: 255 }).unique(),
    createdAt: timestamp("created_at", { fsp: 3 }),
  },
  (table) => [
    index("teamMember_teamId_idx").on(table.teamId),
    index("teamMember_userId_idx").on(table.userId),
  ],
);

export const member = mysqlTable(
  "member",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 255 }).default("member").notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = mysqlTable(
  "invitation",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 255 }),
    teamId: varchar("team_id", { length: 255 }),
    status: varchar("status", { length: 255 }).default("pending").notNull(),
    expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    inviterId: varchar("inviter_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const jwks = mysqlTable("jwks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
  expiresAt: timestamp("expires_at", { fsp: 3 }),
  alg: text("alg"),
  crv: text("crv"),
});

export const oauthClient = mysqlTable(
  "oauth_client",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    clientId: varchar("client_id", { length: 255 }).notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes", { mode: "json" }),
    clientCredentialsScopes: text("client_credentials_scopes", {
      mode: "json",
    }).default([]),
    userId: varchar("user_id", { length: 36 }).references(() => user.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { fsp: 3 }),
    updatedAt: timestamp("updated_at", { fsp: 3 }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts", { mode: "json" }),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris", { mode: "json" }).notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris", { mode: "json" }),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean(
      "backchannel_logout_session_required",
    ),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types", { mode: "json" }),
    responseTypes: text("response_types", { mode: "json" }),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: json("metadata", { mode: "json" }),
  },
  (table) => [index("oauthClient_userId_idx").on(table.userId)],
);

export const oauthResource = mysqlTable("oauth_resource", {
  id: varchar("id", { length: 36 }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: int("access_token_ttl"),
  refreshTokenTtl: int("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes", { mode: "json" }),
  customClaims: json("custom_claims", { mode: "json" }),
  dpopBoundAccessTokensRequired: boolean(
    "dpop_bound_access_tokens_required",
  ).default(false),
  disabled: boolean("disabled").default(false),
  createdAt: timestamp("created_at", { fsp: 3 }),
  updatedAt: timestamp("updated_at", { fsp: 3 }),
  policyVersion: int("policy_version").default(1),
  metadata: json("metadata", { mode: "json" }),
});

export const oauthClientResource = mysqlTable(
  "oauth_client_resource",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    clientId: varchar("client_id", { length: 191 })
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: varchar("resource_id", { length: 191 })
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: json("metadata", { mode: "json" }),
    createdAt: timestamp("created_at", { fsp: 3 }),
  },
  (table) => [
    uniqueIndex("oauthClientResource_clientId_resourceId_uidx").on(
      table.clientId,
      table.resourceId,
    ),
    index("oauthClientResource_clientId_idx").on(table.clientId),
    index("oauthClientResource_resourceId_idx").on(table.resourceId),
  ],
);

export const oauthRefreshToken = mysqlTable(
  "oauth_refresh_token",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    clientId: varchar("client_id", { length: 36 })
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 36 }).references(
      () => session.id,
      { onDelete: "set null" },
    ),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: varchar("authorization_code_id", { length: 255 }),
    resources: text("resources", { mode: "json" }),
    requestedUserInfoClaims: text("requested_user_info_claims", {
      mode: "json",
    }),
    expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    revoked: timestamp("revoked", { fsp: 3 }),
    rotatedAt: timestamp("rotated_at", { fsp: 3 }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", {
      fsp: 3,
    }),
    authTime: timestamp("auth_time", { fsp: 3 }),
    confirmation: json("confirmation", { mode: "json" }),
    scopes: text("scopes", { mode: "json" }).notNull(),
  },
  (table) => [
    index("oauthRefreshToken_clientId_idx").on(table.clientId),
    index("oauthRefreshToken_sessionId_idx").on(table.sessionId),
    index("oauthRefreshToken_userId_idx").on(table.userId),
    index("oauthRefreshToken_authorizationCodeId_idx").on(
      table.authorizationCodeId,
    ),
  ],
);

export const oauthAccessToken = mysqlTable(
  "oauth_access_token",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    clientId: varchar("client_id", { length: 36 })
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 36 }).references(
      () => session.id,
      { onDelete: "set null" },
    ),
    userId: varchar("user_id", { length: 36 }).references(() => user.id, {
      onDelete: "cascade",
    }),
    referenceId: text("reference_id"),
    authorizationCodeId: varchar("authorization_code_id", { length: 255 }),
    resources: text("resources", { mode: "json" }),
    requestedUserInfoClaims: text("requested_user_info_claims", {
      mode: "json",
    }),
    refreshId: varchar("refresh_id", { length: 36 }).references(
      () => oauthRefreshToken.id,
      { onDelete: "cascade" },
    ),
    expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    revoked: timestamp("revoked", { fsp: 3 }),
    confirmation: json("confirmation", { mode: "json" }),
    scopes: text("scopes", { mode: "json" }).notNull(),
  },
  (table) => [
    index("oauthAccessToken_clientId_idx").on(table.clientId),
    index("oauthAccessToken_sessionId_idx").on(table.sessionId),
    index("oauthAccessToken_userId_idx").on(table.userId),
    index("oauthAccessToken_authorizationCodeId_idx").on(
      table.authorizationCodeId,
    ),
    index("oauthAccessToken_refreshId_idx").on(table.refreshId),
  ],
);

export const oauthConsent = mysqlTable(
  "oauth_consent",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    clientId: varchar("client_id", { length: 36 })
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }).references(() => user.id, {
      onDelete: "cascade",
    }),
    referenceId: text("reference_id"),
    resources: text("resources", { mode: "json" }),
    requestedUserInfoClaims: text("requested_user_info_claims", {
      mode: "json",
    }),
    scopes: text("scopes", { mode: "json" }).notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 }).notNull(),
  },
  (table) => [
    index("oauthConsent_clientId_idx").on(table.clientId),
    index("oauthConsent_userId_idx").on(table.userId),
  ],
);

export const oauthClientAssertion = mysqlTable("oauth_client_assertion", {
  id: varchar("id", { length: 36 }).primaryKey(),
  expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
});

export const deviceCode = mysqlTable(
  "device_code",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    deviceCode: varchar("device_code", { length: 191 }).notNull(),
    userCode: varchar("user_code", { length: 191 }).notNull(),
    userId: text("user_id"),
    expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
    status: text("status").notNull(),
    lastPolledAt: timestamp("last_polled_at", { fsp: 3 }),
    pollingInterval: int("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
  },
  (table) => [
    uniqueIndex("deviceCode_deviceCode_uidx").on(table.deviceCode),
    uniqueIndex("deviceCode_userCode_uidx").on(table.userCode),
  ],
);

export const ssoProvider = mysqlTable("sso_provider", {
  id: varchar("id", { length: 36 }).primaryKey(),
  issuer: text("issuer").notNull(),
  oidcConfig: text("oidc_config"),
  samlConfig: text("saml_config"),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id", { length: 255 }).notNull().unique(),
  organizationId: text("organization_id"),
  domain: text("domain").notNull(),
});

export const scimManagedConnection = mysqlTable(
  "scim_managed_connection",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    creationRequestId: varchar("creation_request_id", { length: 255 })
      .notNull()
      .unique(),
    connectionId: varchar("connection_id", { length: 255 }).notNull().unique(),
    provisioningDomainId: varchar("provisioning_domain_id", {
      length: 255,
    }).notNull(),
    status: text("status").notNull(),
    revision: int("revision").notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    createdBy: text("created_by").notNull(),
    decommissionStartedAt: timestamp("decommission_started_at", { fsp: 3 }),
    decommissionStartedBy: text("decommission_started_by"),
    decommissionedAt: timestamp("decommissioned_at", { fsp: 3 }),
    decommissionedBy: text("decommissioned_by"),
  },
  (table) => [
    index("scimManagedConnection_provisioningDomainId_idx").on(
      table.provisioningDomainId,
    ),
  ],
);

export const scimManagedCredential = mysqlTable(
  "scim_managed_credential",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    connectionRecordId: varchar("connection_record_id", { length: 36 })
      .notNull()
      .references(() => scimManagedConnection.id, { onDelete: "cascade" }),
    credentialId: varchar("credential_id", { length: 255 }).notNull().unique(),
    tokenDigest: text("token_digest").notNull(),
    hashVersion: text("hash_version").notNull(),
    activeSlotKey: varchar("active_slot_key", { length: 255 })
      .notNull()
      .unique(),
    status: text("status").notNull(),
    serializedScopes: text("serialized_scopes").notNull(),
    expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    createdBy: text("created_by").notNull(),
    lastUsedAt: timestamp("last_used_at", { fsp: 3 }),
    revokedAt: timestamp("revoked_at", { fsp: 3 }),
    revokedBy: text("revoked_by"),
    decommissionedAt: timestamp("decommissioned_at", { fsp: 3 }),
  },
  (table) => [
    index("scimManagedCredential_connectionRecordId_idx").on(
      table.connectionRecordId,
    ),
  ],
);

export const scimManagedConnectionEvent = mysqlTable(
  "scim_managed_connection_event",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    connectionRecordId: varchar("connection_record_id", { length: 36 })
      .notNull()
      .references(() => scimManagedConnection.id, { onDelete: "cascade" }),
    eventKey: varchar("event_key", { length: 255 }).notNull().unique(),
    sequence: int("sequence").notNull(),
    type: text("type").notNull(),
    actorId: text("actor_id").notNull(),
    credentialId: text("credential_id"),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
  },
  (table) => [
    index("scimManagedConnectionEvent_connectionRecordId_idx").on(
      table.connectionRecordId,
    ),
  ],
);

export const scimConnectionBinding = mysqlTable(
  "scim_connection_binding",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    connectionId: varchar("connection_id", { length: 255 }).notNull(),
    connectionKey: varchar("connection_key", { length: 255 })
      .notNull()
      .unique(),
    provisioningDomainId: text("provisioning_domain_id").notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    decommissionedAt: timestamp("decommissioned_at", { fsp: 3 }),
    decommissionStatus: text("decommission_status").default("active").notNull(),
    decommissionCursorUserId: text("decommission_cursor_user_id"),
    decommissionReconciledUserCount: int("decommission_reconciled_user_count")
      .default(0)
      .notNull(),
    decommissionBatchCount: int("decommission_batch_count")
      .default(0)
      .notNull(),
    decommissionRevision: int("decommission_revision").default(0).notNull(),
    decommissionCompletedAt: timestamp("decommission_completed_at", { fsp: 3 }),
    decommissionLeaseId: text("decommission_lease_id"),
    decommissionLeaseExpiresAt: timestamp("decommission_lease_expires_at", {
      fsp: 3,
    }),
  },
  (table) => [
    index("scimConnectionBinding_connectionId_idx").on(table.connectionId),
  ],
);

export const scimIdentityTombstone = mysqlTable(
  "scim_identity_tombstone",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    connectionId: varchar("connection_id", { length: 255 }).notNull(),
    provisioningDomainId: varchar("provisioning_domain_id", {
      length: 255,
    }).notNull(),
    externalId: text("external_id").notNull(),
    externalIdKey: varchar("external_id_key", { length: 255 })
      .notNull()
      .unique(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    profile: text("profile").notNull(),
    deletedAt: timestamp("deleted_at", { fsp: 3 }).notNull(),
  },
  (table) => [
    index("scimIdentityTombstone_connectionId_idx").on(table.connectionId),
    index("scimIdentityTombstone_provisioningDomainId_idx").on(
      table.provisioningDomainId,
    ),
    index("scimIdentityTombstone_userId_idx").on(table.userId),
  ],
);

export const scimSubject = mysqlTable(
  "scim_subject",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    profileSourceId: varchar("profile_source_id", { length: 255 }),
    revision: int("revision").notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 }).notNull(),
  },
  (table) => [
    index("scimSubject_profileSourceId_idx").on(table.profileSourceId),
  ],
);

export const scimUser = mysqlTable(
  "scim_user",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    connectionId: varchar("connection_id", { length: 255 }).notNull(),
    provisioningDomainId: varchar("provisioning_domain_id", {
      length: 255,
    }).notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionUserKey: varchar("connection_user_key", { length: 255 })
      .notNull()
      .unique(),
    userName: text("user_name").notNull(),
    userNameKey: varchar("user_name_key", { length: 255 }).notNull().unique(),
    primaryEmail: text("primary_email").notNull(),
    workEmailValueIndex: text("work_email_value_index").notNull(),
    emailValueIndex: text("email_value_index").notNull(),
    displayName: text("display_name").notNull(),
    formattedName: text("formatted_name").notNull(),
    givenName: text("given_name"),
    familyName: text("family_name"),
    serializedEmails: text("serialized_emails").notNull(),
    serializedAttributes: text("serialized_attributes"),
    externalId: text("external_id"),
    externalIdKey: varchar("external_id_key", { length: 255 }).unique(),
    active: boolean("active").notNull(),
    orderKey: varchar("order_key", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 }).notNull(),
  },
  (table) => [
    index("scimUser_connectionId_idx").on(table.connectionId),
    index("scimUser_provisioningDomainId_idx").on(table.provisioningDomainId),
    index("scimUser_userId_idx").on(table.userId),
  ],
);

export const scimProjectionGrant = mysqlTable(
  "scim_projection_grant",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    connectionId: varchar("connection_id", { length: 255 }).notNull(),
    provisioningDomainId: varchar("provisioning_domain_id", {
      length: 255,
    }).notNull(),
    scimUserId: varchar("scim_user_id", { length: 36 })
      .notNull()
      .references(() => scimUser.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id").notNull(),
    sourceValue: text("source_value"),
    role: text("role").notNull(),
    grantKey: varchar("grant_key", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 }).notNull(),
  },
  (table) => [
    index("scimProjectionGrant_connectionId_idx").on(table.connectionId),
    index("scimProjectionGrant_provisioningDomainId_idx").on(
      table.provisioningDomainId,
    ),
    index("scimProjectionGrant_scimUserId_idx").on(table.scimUserId),
    index("scimProjectionGrant_userId_idx").on(table.userId),
  ],
);

export const scimGroup = mysqlTable(
  "scim_group",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    connectionId: varchar("connection_id", { length: 255 }).notNull(),
    provisioningDomainId: varchar("provisioning_domain_id", {
      length: 255,
    }).notNull(),
    revision: int("revision").default(0).notNull(),
    displayName: text("display_name").notNull(),
    displayNameKey: varchar("display_name_key", { length: 255 })
      .notNull()
      .unique(),
    externalId: text("external_id"),
    externalIdKey: varchar("external_id_key", { length: 255 }).unique(),
    orderKey: varchar("order_key", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    updatedAt: timestamp("updated_at", { fsp: 3 }).notNull(),
  },
  (table) => [
    index("scimGroup_connectionId_idx").on(table.connectionId),
    index("scimGroup_provisioningDomainId_idx").on(table.provisioningDomainId),
  ],
);

export const scimGroupMember = mysqlTable(
  "scim_group_member",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    connectionId: varchar("connection_id", { length: 255 }).notNull(),
    groupId: varchar("group_id", { length: 36 })
      .notNull()
      .references(() => scimGroup.id, { onDelete: "cascade" }),
    scimUserId: varchar("scim_user_id", { length: 36 })
      .notNull()
      .references(() => scimUser.id, { onDelete: "cascade" }),
    membershipKey: varchar("membership_key", { length: 255 })
      .notNull()
      .unique(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
  },
  (table) => [
    index("scimGroupMember_connectionId_idx").on(table.connectionId),
    index("scimGroupMember_groupId_idx").on(table.groupId),
    index("scimGroupMember_scimUserId_idx").on(table.scimUserId),
  ],
);

export const walletAddress = mysqlTable(
  "wallet_address",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    chainId: int("chain_id").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
  },
  (table) => [index("walletAddress_userId_idx").on(table.userId)],
);

export const subscription = mysqlTable("subscription", {
  id: varchar("id", { length: 36 }).primaryKey(),
  plan: text("plan").notNull(),
  referenceId: text("reference_id").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").default("incomplete").notNull(),
  periodStart: timestamp("period_start", { fsp: 3 }),
  periodEnd: timestamp("period_end", { fsp: 3 }),
  trialStart: timestamp("trial_start", { fsp: 3 }),
  trialEnd: timestamp("trial_end", { fsp: 3 }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  cancelAt: timestamp("cancel_at", { fsp: 3 }),
  canceledAt: timestamp("canceled_at", { fsp: 3 }),
  endedAt: timestamp("ended_at", { fsp: 3 }),
  seats: int("seats"),
  billingInterval: text("billing_interval"),
  stripeScheduleId: text("stripe_schedule_id"),
});

export const rateLimit = mysqlTable("rate_limit", {
  id: varchar("id", { length: 36 }).primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  count: int("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  accounts: many(account),
  twoFactors: many(twoFactor),
  passkeys: many(passkey),
  teamMembers: many(teamMember),
  members: many(member),
  invitations: many(invitation),
  oauthClients: many(oauthClient),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
  ssoProviders: many(ssoProvider),
  scimIdentityTombstones: many(scimIdentityTombstone),
  scimSubject: one(scimSubject),
  scimUsers: many(scimUser),
  scimProjectionGrants: many(scimProjectionGrant),
  walletAddresss: many(walletAddress),
}));

export const sessionRelations = relations(session, ({ one, many }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
    references: [user.id],
  }),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, {
    fields: [passkey.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  organizationRoles: many(organizationRole),
  teams: many(team),
  members: many(member),
  invitations: many(invitation),
}));

export const organizationRoleRelations = relations(
  organizationRole,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationRole.organizationId],
      references: [organization.id],
    }),
  }),
);

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, {
    fields: [team.organizationId],
    references: [organization.id],
  }),
  teamMembers: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const oauthClientRelations = relations(oauthClient, ({ one, many }) => ({
  user: one(user, {
    fields: [oauthClient.userId],
    references: [user.id],
  }),
  oauthClientResources: many(oauthClientResource),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
}));

export const oauthResourceRelations = relations(oauthResource, ({ many }) => ({
  oauthClientResources: many(oauthClientResource),
}));

export const oauthClientResourceRelations = relations(
  oauthClientResource,
  ({ one }) => ({
    oauthClient: one(oauthClient, {
      fields: [oauthClientResource.clientId],
      references: [oauthClient.clientId],
    }),
    oauthResource: one(oauthResource, {
      fields: [oauthClientResource.resourceId],
      references: [oauthResource.identifier],
    }),
  }),
);

export const oauthRefreshTokenRelations = relations(
  oauthRefreshToken,
  ({ one, many }) => ({
    oauthClient: one(oauthClient, {
      fields: [oauthRefreshToken.clientId],
      references: [oauthClient.clientId],
    }),
    session: one(session, {
      fields: [oauthRefreshToken.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [oauthRefreshToken.userId],
      references: [user.id],
    }),
    oauthAccessTokens: many(oauthAccessToken),
  }),
);

export const oauthAccessTokenRelations = relations(
  oauthAccessToken,
  ({ one }) => ({
    oauthClient: one(oauthClient, {
      fields: [oauthAccessToken.clientId],
      references: [oauthClient.clientId],
    }),
    session: one(session, {
      fields: [oauthAccessToken.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [oauthAccessToken.userId],
      references: [user.id],
    }),
    oauthRefreshToken: one(oauthRefreshToken, {
      fields: [oauthAccessToken.refreshId],
      references: [oauthRefreshToken.id],
    }),
  }),
);

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
  oauthClient: one(oauthClient, {
    fields: [oauthConsent.clientId],
    references: [oauthClient.clientId],
  }),
  user: one(user, {
    fields: [oauthConsent.userId],
    references: [user.id],
  }),
}));

export const ssoProviderRelations = relations(ssoProvider, ({ one }) => ({
  user: one(user, {
    fields: [ssoProvider.userId],
    references: [user.id],
  }),
}));

export const scimManagedConnectionRelations = relations(
  scimManagedConnection,
  ({ many }) => ({
    scimManagedCredentials: many(scimManagedCredential),
    scimManagedConnectionEvents: many(scimManagedConnectionEvent),
  }),
);

export const scimManagedCredentialRelations = relations(
  scimManagedCredential,
  ({ one }) => ({
    scimManagedConnection: one(scimManagedConnection, {
      fields: [scimManagedCredential.connectionRecordId],
      references: [scimManagedConnection.id],
    }),
  }),
);

export const scimManagedConnectionEventRelations = relations(
  scimManagedConnectionEvent,
  ({ one }) => ({
    scimManagedConnection: one(scimManagedConnection, {
      fields: [scimManagedConnectionEvent.connectionRecordId],
      references: [scimManagedConnection.id],
    }),
  }),
);

export const scimIdentityTombstoneRelations = relations(
  scimIdentityTombstone,
  ({ one }) => ({
    user: one(user, {
      fields: [scimIdentityTombstone.userId],
      references: [user.id],
    }),
  }),
);

export const scimSubjectRelations = relations(scimSubject, ({ one }) => ({
  user: one(user, {
    fields: [scimSubject.userId],
    references: [user.id],
  }),
}));

export const scimUserRelations = relations(scimUser, ({ one, many }) => ({
  user: one(user, {
    fields: [scimUser.userId],
    references: [user.id],
  }),
  scimProjectionGrants: many(scimProjectionGrant),
  scimGroupMembers: many(scimGroupMember),
}));

export const scimProjectionGrantRelations = relations(
  scimProjectionGrant,
  ({ one }) => ({
    scimUser: one(scimUser, {
      fields: [scimProjectionGrant.scimUserId],
      references: [scimUser.id],
    }),
    user: one(user, {
      fields: [scimProjectionGrant.userId],
      references: [user.id],
    }),
  }),
);

export const scimGroupRelations = relations(scimGroup, ({ many }) => ({
  scimGroupMembers: many(scimGroupMember),
}));

export const scimGroupMemberRelations = relations(
  scimGroupMember,
  ({ one }) => ({
    scimGroup: one(scimGroup, {
      fields: [scimGroupMember.groupId],
      references: [scimGroup.id],
    }),
    scimUser: one(scimUser, {
      fields: [scimGroupMember.scimUserId],
      references: [scimUser.id],
    }),
  }),
);

export const walletAddressRelations = relations(walletAddress, ({ one }) => ({
  user: one(user, {
    fields: [walletAddress.userId],
    references: [user.id],
  }),
}));
