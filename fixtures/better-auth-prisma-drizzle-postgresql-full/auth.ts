import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin } from 'better-auth/plugins/admin'
import { jwt } from 'better-auth/plugins/jwt'
import { organization } from 'better-auth/plugins/organization'
import { twoFactor } from 'better-auth/plugins/two-factor'

export const auth = betterAuth({
  database: prismaAdapter(undefined!, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  plugins: [twoFactor(), admin(), organization(), jwt()],
})
