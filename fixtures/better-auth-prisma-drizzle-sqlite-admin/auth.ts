import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin } from 'better-auth/plugins/admin'

export const auth = betterAuth({
  database: prismaAdapter(undefined!, { provider: 'sqlite' }),
  emailAndPassword: { enabled: true },
  plugins: [admin()],
})
