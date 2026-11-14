// The `auth.ts` modules run for real: each is written to a directory that sees this package's
// hono, imported, and put in front of a route, then asked with tokens signed here.
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { sign } from 'hono/jwt'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AuthKind } from '../types/index.js'
import { authModule } from './zod-openapi-hono.js'

const dirs: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** A fresh copy of the module, so the JWKS cache of one test is not another's. */
async function loadAuth(kind: AuthKind) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-auth-'))
  dirs.push(dir)
  symlinkSync(
    path.resolve(import.meta.dirname, '../../node_modules'),
    path.join(dir, 'node_modules'),
    'dir',
  )
  const file = path.join(dir, 'auth.ts')
  writeFileSync(file, authModule(kind))
  const module: { auth: MiddlewareHandler } = await import(pathToFileURL(file).href)
  const app = new Hono()
  app.use('/users/*', module.auth)
  app.get('/users/me', (c) => c.json(c.get('jwtPayload')))
  return app
}

/** The status of `GET /users/me` with the token, or with no Authorization header. */
async function statusOf(app: Hono, token?: string) {
  const headers: Record<string, string> =
    token === undefined ? {} : { Authorization: `Bearer ${token}` }
  const response = await app.request('/users/me', { headers })
  return response.status
}

const now = () => Math.floor(Date.now() / 1000)

describe('auth = "jwt"', () => {
  const SECRET = 'a'.repeat(32)
  const claims = () => ({
    sub: 'u1',
    iss: 'https://issuer.test',
    aud: 'api',
    iat: now(),
    exp: now() + 600,
    role: 'admin',
  })

  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', SECRET)
    vi.stubEnv('JWT_ISSUER', 'https://issuer.test')
    vi.stubEnv('JWT_AUDIENCE', 'api')
  })

  it('lets a token through that is signed, from the issuer, for the audience, and short-lived', async () => {
    const app = await loadAuth('jwt')
    const response = await app.request('/users/me', {
      headers: { Authorization: `Bearer ${await sign(claims(), SECRET)}` },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ sub: 'u1' })
  })

  it('refuses a request without a token', async () => {
    expect(await statusOf(await loadAuth('jwt'))).toBe(401)
  })

  it('answers 403 to a valid token without the admin role, and lets one holding it through', async () => {
    const app = await loadAuth('jwt')
    const { role: _role, ...withoutRole } = claims()
    expect(await statusOf(app, await sign(withoutRole, SECRET))).toBe(403)
    expect(await statusOf(app, await sign({ ...claims(), role: 'user' }, SECRET))).toBe(403)
    expect(await statusOf(app, await sign({ ...claims(), role: ['user'] }, SECRET))).toBe(403)
    expect(
      await statusOf(app, await sign({ ...claims(), role: ['editor', 'admin'] }, SECRET)),
    ).toBe(200)
  })

  it('checks the signature before the role: a forged admin token is 401, not 403', async () => {
    const app = await loadAuth('jwt')
    expect(await statusOf(app, await sign(claims(), 'b'.repeat(32)))).toBe(401)
  })

  it('refuses a token that would never expire, or has no iat', async () => {
    const app = await loadAuth('jwt')
    const { exp: _exp, ...forever } = claims()
    const { iat: _iat, ...undated } = claims()
    expect(await statusOf(app, await sign(forever, SECRET))).toBe(401)
    expect(await statusOf(app, await sign(undated, SECRET))).toBe(401)
  })

  it('refuses a token issued for more than an hour, and one expired', async () => {
    const app = await loadAuth('jwt')
    expect(await statusOf(app, await sign({ ...claims(), exp: now() + 3601 }, SECRET))).toBe(401)
    expect(
      await statusOf(app, await sign({ ...claims(), iat: now() - 120, exp: now() - 60 }, SECRET)),
    ).toBe(401)
  })

  it('refuses a token from another issuer, for another audience, or signed with another secret', async () => {
    const app = await loadAuth('jwt')
    expect(
      await statusOf(app, await sign({ ...claims(), iss: 'https://other.test' }, SECRET)),
    ).toBe(401)
    expect(await statusOf(app, await sign({ ...claims(), aud: 'other' }, SECRET))).toBe(401)
    expect(await statusOf(app, await sign(claims(), 'b'.repeat(32)))).toBe(401)
    expect(await statusOf(app, await sign(claims(), SECRET, 'HS512'))).toBe(401)
  })

  it('fails every request, never letting one through, when it is not configured', async () => {
    const app = await loadAuth('jwt')
    const token = await sign(claims(), SECRET)
    vi.stubEnv('JWT_SECRET', 'short')
    expect(await statusOf(app, token)).toBe(500)
    vi.stubEnv('JWT_SECRET', SECRET)
    vi.stubEnv('JWT_AUDIENCE', '')
    expect(await statusOf(app, token)).toBe(500)
  })
})

describe('auth = "jwks"', () => {
  const JWKS_URI = 'https://issuer.test/.well-known/jwks.json'
  const claims = () => ({
    sub: 'u1',
    iss: 'https://issuer.test',
    aud: 'api',
    iat: now(),
    exp: now() + 600,
    role: 'admin',
  })

  /** An ES256 key pair as JWKs, the private one to sign with and the public one to publish. */
  async function keyPair(kid: string) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    const privateJwk = {
      ...(await crypto.subtle.exportKey('jwk', pair.privateKey)),
      kid,
      alg: 'ES256',
    }
    const publicJwk = {
      ...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
      kid,
      alg: 'ES256',
    }
    return { privateJwk, publicJwk }
  }

  /** `fetch` answering the JWKS with the keys `published` holds when it is called. */
  function publish(published: { keys: JsonWebKey[] }) {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>((input) =>
      Promise.resolve(
        input === JWKS_URI ? Response.json(published) : new Response(null, { status: 404 }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  beforeEach(() => {
    vi.stubEnv('JWKS_URI', JWKS_URI)
    vi.stubEnv('JWT_ISSUER', 'https://issuer.test')
    vi.stubEnv('JWT_AUDIENCE', 'api')
  })

  it('lets a token through that is signed with a published key, and fetches the keys once', async () => {
    const { privateJwk, publicJwk } = await keyPair('k1')
    const fetchMock = publish({ keys: [publicJwk] })
    const app = await loadAuth('jwks')
    expect(await statusOf(app, await sign(claims(), privateJwk))).toBe(200)
    expect(await statusOf(app, await sign(claims(), privateJwk))).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a token without exp, from another issuer, or signed with a key not published', async () => {
    const { privateJwk, publicJwk } = await keyPair('k1')
    const stranger = await keyPair('k1')
    publish({ keys: [publicJwk] })
    const app = await loadAuth('jwks')
    const { exp: _exp, ...forever } = claims()
    expect(await statusOf(app, await sign(forever, privateJwk))).toBe(401)
    expect(
      await statusOf(app, await sign({ ...claims(), iss: 'https://other.test' }, privateJwk)),
    ).toBe(401)
    expect(await statusOf(app, await sign(claims(), stranger.privateJwk))).toBe(401)
  })

  it('answers 403 to a valid token without the admin role', async () => {
    const { privateJwk, publicJwk } = await keyPair('k1')
    publish({ keys: [publicJwk] })
    const app = await loadAuth('jwks')
    expect(await statusOf(app, await sign({ ...claims(), role: 'user' }, privateJwk))).toBe(403)
    expect(await statusOf(app, await sign({ ...claims(), role: ['admin'] }, privateJwk))).toBe(200)
  })

  it('refuses a token signed with a shared secret', async () => {
    const { publicJwk } = await keyPair('k1')
    publish({ keys: [publicJwk] })
    expect(await statusOf(await loadAuth('jwks'), await sign(claims(), 'a'.repeat(32)))).toBe(401)
  })

  it('fetches the keys again for a kid it lacks, at most once a minute', async () => {
    const first = await keyPair('k1')
    const second = await keyPair('k2')
    const published = { keys: [first.publicJwk] }
    const fetchMock = publish(published)
    const app = await loadAuth('jwks')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      expect(await statusOf(app, await sign(claims(), first.privateJwk))).toBe(200)
      published.keys.push(second.publicJwk)
      // Within the minute, an unknown kid does not reach the issuer.
      expect(await statusOf(app, await sign(claims(), second.privateJwk))).toBe(401)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      vi.setSystemTime(Date.now() + 61_000)
      expect(await statusOf(app, await sign(claims(), second.privateJwk))).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails every request when it is not configured or JWKS_URI is not https', async () => {
    const { privateJwk, publicJwk } = await keyPair('k1')
    publish({ keys: [publicJwk] })
    const app = await loadAuth('jwks')
    const token = await sign(claims(), privateJwk)
    vi.stubEnv('JWKS_URI', 'http://issuer.test/.well-known/jwks.json')
    expect(await statusOf(app, token)).toBe(500)
    vi.stubEnv('JWKS_URI', JWKS_URI)
    vi.stubEnv('JWT_ISSUER', '')
    expect(await statusOf(app, token)).toBe(500)
  })
})

describe('auth = "cloudflare-access"', () => {
  const TEAM = 'https://team.cloudflareaccess.com'
  const CERTS = `${TEAM}/cdn-cgi/access/certs`
  const AUD = 'aud-tag-of-the-application'
  const claims = () => ({
    sub: 'u1',
    email: 'someone@example.com',
    iss: TEAM,
    aud: [AUD],
    iat: now(),
    exp: now() + 600,
  })

  /** An RS256 key pair as JWKs, as Access signs with. */
  async function rsaKeyPair(kid: string) {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )
    const privateJwk = {
      ...(await crypto.subtle.exportKey('jwk', pair.privateKey)),
      kid,
      alg: 'RS256',
    }
    const publicJwk = {
      ...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
      kid,
      alg: 'RS256',
    }
    return { privateJwk, publicJwk }
  }

  /** `fetch` answering the team's certs with `keys`, and 404 for anything else. */
  function publishCerts(keys: JsonWebKey[]) {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>((input) =>
      Promise.resolve(
        input === CERTS ? Response.json({ keys }) : new Response(null, { status: 404 }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  /** The status and body of `GET /users/me` with the token in Cf-Access-Jwt-Assertion. */
  async function askWith(app: Hono, headers: Record<string, string>) {
    const response = await app.request('/users/me', { headers })
    return {
      status: response.status,
      body: response.status === 200 ? await response.json() : undefined,
    }
  }

  /** The status of `GET /users/me` with the headers. */
  async function statusWith(app: Hono, headers: Record<string, string>) {
    const answer = await askWith(app, headers)
    return answer.status
  }

  beforeEach(() => {
    vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', TEAM)
    vi.stubEnv('CF_ACCESS_AUD', AUD)
  })

  it('lets through the token Access puts in Cf-Access-Jwt-Assertion, its payload to the handler', async () => {
    const { privateJwk, publicJwk } = await rsaKeyPair('k1')
    const fetchMock = publishCerts([publicJwk])
    const app = await loadAuth('cloudflare-access')
    const token = await sign(claims(), privateJwk)
    const answer = await askWith(app, { 'Cf-Access-Jwt-Assertion': token })
    expect(answer.status).toBe(200)
    expect(answer.body).toMatchObject({ email: 'someone@example.com' })
    expect(await statusWith(app, { 'Cf-Access-Jwt-Assertion': token })).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a request without the header, even with the token as a bearer', async () => {
    const { privateJwk, publicJwk } = await rsaKeyPair('k1')
    publishCerts([publicJwk])
    const app = await loadAuth('cloudflare-access')
    expect(await statusWith(app, {})).toBe(401)
    const bearer = `Bearer ${await sign(claims(), privateJwk)}`
    expect(await statusWith(app, { Authorization: bearer })).toBe(401)
  })

  it('refuses a token for another application, from another team, without exp, or signed with another key', async () => {
    const { privateJwk, publicJwk } = await rsaKeyPair('k1')
    const stranger = await rsaKeyPair('k1')
    publishCerts([publicJwk])
    const app = await loadAuth('cloudflare-access')
    const { exp: _exp, ...forever } = claims()
    const statusFor = async (token: string) =>
      await statusWith(app, { 'Cf-Access-Jwt-Assertion': token })
    expect(
      await statusFor(await sign({ ...claims(), aud: ['another-application'] }, privateJwk)),
    ).toBe(401)
    expect(
      await statusFor(
        await sign({ ...claims(), iss: 'https://other.cloudflareaccess.com' }, privateJwk),
      ),
    ).toBe(401)
    expect(await statusFor(await sign(forever, privateJwk))).toBe(401)
    expect(await statusFor(await sign(claims(), stranger.privateJwk))).toBe(401)
    expect(await statusFor(await sign(claims(), 'a'.repeat(32)))).toBe(401)
    expect(await statusFor('not-a-token')).toBe(401)
  })

  it('fails every request when it is not configured, the team domain is not https, or the keys cannot be had', async () => {
    const { privateJwk, publicJwk } = await rsaKeyPair('k1')
    publishCerts([publicJwk])
    const app = await loadAuth('cloudflare-access')
    const headers = { 'Cf-Access-Jwt-Assertion': await sign(claims(), privateJwk) }
    vi.stubEnv('CF_ACCESS_AUD', '')
    expect(await statusWith(app, headers)).toBe(500)
    vi.stubEnv('CF_ACCESS_AUD', AUD)
    vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', 'http://team.cloudflareaccess.com')
    expect(await statusWith(app, headers)).toBe(500)
    vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', 'https://unknown.cloudflareaccess.com')
    expect(await statusWith(app, headers)).toBe(500)
  })
})
