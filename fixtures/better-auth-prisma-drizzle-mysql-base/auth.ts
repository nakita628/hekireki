import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'


export const auth = betterAuth({
  database: prismaAdapter(undefined!, { provider: 'mysql' }),
  emailAndPassword: { enabled: true },
  
})
