import { env } from 'hono/adapter'
import { createMiddleware } from 'hono/factory'
import { jwt } from 'hono/jwt'

/**
 * Lets a request through with a JWT in `Authorization: Bearer <token>`, signed with HS256 by the
 * secret `JWT_SECRET`, and answers 401 otherwise. A handler reads the token's payload with
 * `c.get('jwtPayload')`.
 */
export const auth = createMiddleware(async (c, next) => {
  const { JWT_SECRET } = env<{ JWT_SECRET: string }>(c)
  return jwt({ secret: JWT_SECRET, alg: 'HS256' })(c, next)
})
