import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { organization } from 'better-auth/plugins/organization'

export const auth = betterAuth({
  database: prismaAdapter(undefined!, { provider: 'mysql' }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
})
