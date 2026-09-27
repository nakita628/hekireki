// Every Better Auth plugin that keeps something in the database. Nothing here reaches a service:
// the clients and secrets the plugins ask for are placeholders.
import { apiKey } from '@better-auth/api-key'
import { oauthProvider } from '@better-auth/oauth-provider'
import { passkey } from '@better-auth/passkey'
import { scim } from '@better-auth/scim'
import { sso } from '@better-auth/sso'
import { stripe } from '@better-auth/stripe'
import {
  admin,
  anonymous,
  deviceAuthorization,
  jwt,
  lastLoginMethod,
  organization,
  phoneNumber,
  siwe,
  twoFactor,
  username,
} from 'better-auth/plugins'

export const plugins = [
  username(),
  anonymous(),
  phoneNumber(),
  twoFactor(),
  passkey(),
  admin(),
  apiKey(),
  organization({ teams: { enabled: true }, dynamicAccessControl: { enabled: true } }),
  jwt(),
  oauthProvider({ loginPage: '/sign-in', consentPage: '/consent' }),
  deviceAuthorization(),
  sso(),
  scim({
    connections: [],
    managedConnections: { credentialHashSecret: 'placeholder-placeholder-placeholder-placeholder' },
  }),
  siwe({
    domain: 'example.com',
    getNonce: async () => 'nonce',
    verifyMessage: async () => true,
  }),
  lastLoginMethod({ storeInDatabase: true }),
  stripe({
    stripeClient: {} as never,
    stripeWebhookSecret: 'whsec_placeholder',
    subscription: { enabled: true, plans: [] },
  }),
]
