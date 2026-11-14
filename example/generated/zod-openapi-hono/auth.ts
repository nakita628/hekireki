import { env } from 'hono/adapter'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { jwt } from 'hono/jwt'

/** The longest a token may live, from its `iat` to its `exp`: one issued for longer is refused. */
const MAX_TOKEN_LIFETIME_SECONDS = 60 * 60

/** The fewest bytes `JWT_SECRET` may have: HS256 takes a key no shorter than its 32-byte hash. */
const MIN_SECRET_BYTES = 32

/** A claim of the token's payload when it is a number, and undefined otherwise. */
function numberClaim(payload: unknown, name: string) {
  if (typeof payload !== 'object' || payload === null) return undefined
  const value: unknown = Reflect.get(payload, name)
  return typeof value === 'number' ? value : undefined
}

/** The 401 a token is refused with when it lacks a claim it must have. */
function unauthorized(description: string) {
  return new HTTPException(401, {
    res: new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer error="invalid_token",error_description="' + description + '"',
      },
    }),
  })
}

/** The claim of the token that holds the roles of its user: a string, or an array of strings. */
const ROLE_CLAIM = 'role'

/**
 * The roles of which a token must hold one to reach the API, answered 403 otherwise. The API
 * writes every model, so only an admin reaches it until this says who else may; an empty list
 * lets any valid token through.
 */
const REQUIRED_ROLES: readonly string[] = ['admin']

/** The roles the token's payload holds under ROLE_CLAIM. */
function rolesOf(payload: unknown): readonly string[] {
  if (typeof payload !== 'object' || payload === null) return []
  const value: unknown = Reflect.get(payload, ROLE_CLAIM)
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? value.filter((role) => typeof role === 'string') : []
}

/** Whether the token holds one of REQUIRED_ROLES, or none is asked for. */
function hasRequiredRole(payload: unknown) {
  if (REQUIRED_ROLES.length === 0) return true
  return rolesOf(payload).some((role) => REQUIRED_ROLES.includes(role))
}

/** The 403 a valid token is refused with when it lacks every role REQUIRED_ROLES names. */
function forbidden() {
  return new HTTPException(403, { res: new Response('Forbidden', { status: 403 }) })
}

/**
 * Lets a request through with a JWT in `Authorization: Bearer <token>`, signed with HS256 by the
 * secret `JWT_SECRET`, issued by `JWT_ISSUER` for `JWT_AUDIENCE`, with an `exp` at most
 * MAX_TOKEN_LIFETIME_SECONDS after its `iat`, and answers 401 otherwise; a token without one of
 * REQUIRED_ROLES is answered 403. The variables are read
 * from the environment of the runtime (`process.env` on Node, the bindings on Workers). Without
 * one of them, or with a secret shorter than MIN_SECRET_BYTES, every request fails with 500: the
 * app never runs unguarded. A handler reads the token's payload with `c.get('jwtPayload')`.
 */
export const auth = createMiddleware(async (c, next) => {
  const { JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE } = env<{
    JWT_SECRET?: string
    JWT_ISSUER?: string
    JWT_AUDIENCE?: string
  }>(c)
  if (!JWT_SECRET || new TextEncoder().encode(JWT_SECRET).length < MIN_SECRET_BYTES) {
    throw new Error('JWT_SECRET must be a random secret of at least 32 bytes')
  }
  if (!JWT_ISSUER || !JWT_AUDIENCE) throw new Error('JWT_ISSUER and JWT_AUDIENCE must be set')
  const verify = jwt({
    secret: JWT_SECRET,
    alg: 'HS256',
    verification: { iss: JWT_ISSUER, aud: JWT_AUDIENCE },
  })
  return verify(c, async () => {
    // hono/jwt checks exp and iat only when the token has them: one without either never expires.
    const payload = c.get('jwtPayload')
    const exp = numberClaim(payload, 'exp')
    const iat = numberClaim(payload, 'iat')
    if (exp === undefined || iat === undefined) throw unauthorized('token without exp or iat')
    if (exp - iat > MAX_TOKEN_LIFETIME_SECONDS) throw unauthorized('token lives too long')
    if (!hasRequiredRole(payload)) throw forbidden()
    await next()
  })
})
