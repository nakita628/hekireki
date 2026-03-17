import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { twoFactor } from 'better-auth/plugins/two-factor'

export const auth = betterAuth({
  database: drizzleAdapter(undefined!, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  plugins: [twoFactor()],
})
