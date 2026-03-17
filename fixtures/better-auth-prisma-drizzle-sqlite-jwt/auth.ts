import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { jwt } from 'better-auth/plugins/jwt'

export const auth = betterAuth({
  database: prismaAdapter(undefined!, { provider: 'sqlite' }),
  emailAndPassword: { enabled: true },
  plugins: [jwt()],
})
