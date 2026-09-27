// Better Auth on the provider BETTER_AUTH_PROVIDER names, for `auth generate` to read and write
// the models of <provider>/schema.prisma from.
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { betterAuth } from 'better-auth'

import { plugins } from './plugins.ts'

const provider = process.env.BETTER_AUTH_PROVIDER
if (provider !== 'sqlite' && provider !== 'postgresql' && provider !== 'mysql') {
  throw new Error('BETTER_AUTH_PROVIDER is sqlite, postgresql or mysql')
}

export const auth = betterAuth({
  baseURL: 'http://localhost:3000',
  // No client: nothing is read or written here. SCIM asks for an adapter with transactions, which
  // the Prisma adapter has when its client has `$transaction` and `transaction` is on.
  database: prismaAdapter({ $transaction: async () => undefined }, { provider, transaction: true }),
  emailAndPassword: { enabled: true },
  rateLimit: { storage: 'database' },
  plugins,
})
