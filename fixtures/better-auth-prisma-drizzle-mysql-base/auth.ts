import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'

export const auth = betterAuth({
  // biome-ignore lint/style/noNonNullAssertion: fixture config stub
  database: prismaAdapter(undefined!, { provider: 'mysql' }),
  emailAndPassword: { enabled: true },
})
