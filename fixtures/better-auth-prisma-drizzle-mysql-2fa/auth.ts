import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { twoFactor } from 'better-auth/plugins/two-factor'

export const auth = betterAuth({
  database: prismaAdapter(undefined!, { provider: 'mysql' }),
  emailAndPassword: { enabled: true },
  plugins: [twoFactor()],
})
