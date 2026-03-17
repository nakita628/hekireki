import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'

export const auth = betterAuth({
  database: drizzleAdapter(undefined!, { provider: 'sqlite' }),
  emailAndPassword: { enabled: true },
  plugins: [admin()],
})
