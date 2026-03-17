import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { jwt } from 'better-auth/plugins/jwt'

export const auth = betterAuth({
  database: drizzleAdapter(undefined!, { provider: 'sqlite' }),
  emailAndPassword: { enabled: true },
  plugins: [jwt()],
})
