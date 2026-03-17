import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

export const auth = betterAuth({
  database: drizzleAdapter(undefined!, { provider: 'mysql' }),
  emailAndPassword: { enabled: true },
  
})
