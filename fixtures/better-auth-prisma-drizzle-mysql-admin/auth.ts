import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin } from 'better-auth/plugins/admin'

export const auth = betterAuth({
  // biome-ignore lint/style/noNonNullAssertion: fixture config stub
  database: prismaAdapter(undefined!, { provider: 'mysql' }),
  emailAndPassword: { enabled: true },
  plugins: [admin()],
})
