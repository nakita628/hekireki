// The fixed values of the guard Hekireki-ZodOpenAPIHono writes (`auth.ts`): which kinds of `auth`
// it takes. The module's own limits (token lifetime, secret length, JWKS cache) are written into
// the module, the user's to change after.
import type { AuthKind } from '../types/index.js'

/**
 * The kinds of `auth` the generator writes a module for: `jwt` (HS256 with `JWT_SECRET`), `jwks`
 * (an asymmetric signature checked with the keys an issuer publishes at `JWKS_URI`) and
 * `cloudflare-access` (the token Cloudflare Access puts in `Cf-Access-Jwt-Assertion`).
 *
 * Hekireki's own, stable: a kind joins the list with its module. The modules build on Hono's
 * `hono/jwt` and `hono/jwk`; when hono is upgraded, check that `jwt()`, `jwk()` and
 * `verifyWithJwks()` still take `verification` with `iss` and `aud`, and that `verify` still
 * checks `exp` only when a token has it (`hono/dist/utils/jwt/jwt.js`), which is why the modules
 * require it themselves.
 *
 * The `cloudflare-access` module names what Cloudflare owns: the header `Cf-Access-Jwt-Assertion`,
 * the keys at `<team domain>/cdn-cgi/access/certs`, RS256, the team domain as `iss` and the
 * Application Audience tag as `aud`. If Cloudflare changes one, check its guide "Validate JWTs"
 * (developers.cloudflare.com, Cloudflare One, Access) against the module.
 */
export const AUTH_KINDS: readonly AuthKind[] = ['jwt', 'jwks', 'cloudflare-access']
