import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins/organization'

export const auth = betterAuth({
  // biome-ignore lint/style/noNonNullAssertion: fixture config stub
  database: drizzleAdapter(undefined!, { provider: 'mysql' }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
})
