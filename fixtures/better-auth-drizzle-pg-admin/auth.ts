import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'

export const auth = betterAuth({
  // biome-ignore lint/style/noNonNullAssertion: fixture config stub
  database: drizzleAdapter(undefined!, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  plugins: [admin()],
})
