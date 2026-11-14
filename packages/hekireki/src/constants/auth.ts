// The fixed values of the guard Hekireki-ZodOpenAPIHono writes (`auth.ts`): which kinds of `auth`
// it takes. The module's own limits (token lifetime, secret length, JWKS cache) are written into
// the module, the user's to change after.
import type { AuthKind } from '../types/index.js'

/**
 * The kinds of `auth` the generator writes a module for: `jwt` (HS256 with `JWT_SECRET`) and
 * `jwks` (an asymmetric signature checked with the keys an issuer publishes at `JWKS_URI`).
 *
 * Hekireki's own, stable: a kind joins the list with its module. Both modules build on Hono's
 * `hono/jwt` and `hono/jwk`; when hono is upgraded, check that `jwt()` and `jwk()` still take
 * `verification` with `iss` and `aud`, and that `verify` still checks `exp` only when a token
 * has it (`hono/dist/utils/jwt/jwt.js`), which is why the modules require it themselves.
 */
export const AUTH_KINDS: readonly AuthKind[] = ['jwt', 'jwks']
