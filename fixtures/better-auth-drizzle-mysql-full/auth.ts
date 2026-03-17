import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'
import { jwt } from 'better-auth/plugins/jwt'
import { organization } from 'better-auth/plugins/organization'
import { twoFactor } from 'better-auth/plugins/two-factor'

export const auth = betterAuth({
  // biome-ignore lint/style/noNonNullAssertion: fixture config stub
  database: drizzleAdapter(undefined!, { provider: 'mysql' }),
  emailAndPassword: { enabled: true },
  plugins: [twoFactor(), admin(), organization(), jwt()],
})
