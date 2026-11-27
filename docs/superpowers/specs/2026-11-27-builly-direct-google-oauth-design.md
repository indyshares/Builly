# Builly Direct Google OAuth & Builly-Owned Identity — Design

## Intent

Remove every runtime and build-time Supabase dependency. Google becomes the only external identity provider; Builly owns accounts, sessions, authorization, and the encrypted Workspace credential lifecycle on Cloudflare Workers + D1.

## Goals

- Direct Google Authorization Code + PKCE flow between browser and Worker.
- OIDC ID token verification using Google JWKS (RS256, issuer/audience/expiry/nonce/azp).
- Builly-owned opaque sessions in HttpOnly cookies; only SHA-256 hashes stored in D1.
- Worker middleware resolves Account from server-side session; fail closed.
- Existing D1 `owner_id` values stay usable via explicit `(provider, subject) → account` mapping.
- Workspace credentials remain AES-256-GCM encrypted with the existing key.
- Zero Supabase SDK, env vars, auth calls, or JWT acceptance.

## Non-goals / anti-goals

- No canonical business data migration from Google Drive into D1.
- No automatic account merge by email.
- No production deployment, secret changes, or Supabase resource shutdown in this work.
- No new identity providers yet (the provider seam exists, Google is the only implementation).
- No broadened Drive scope without owner approval.

## Approaches considered

1. **Keep Supabase for identity, proxy it from Worker** — rejected: violates the final decision and keeps a third-party session/JWT dependency.
2. **Use Google ID token directly as the app session** — rejected: no server revocation, no idle/absolute expiry, no logout control.
3. **Chosen: Worker-mediated OIDC + Builly opaque sessions in D1** — server owns identity mapping and revocation; browser never sees a token.

## Decisions made here

- Callback: `https://builly.indyshares.com/api/auth/google/callback` via `GOOGLE_OAUTH_REDIRECT_URI`.
- Legacy workspace OAuth keeps `/api/google/oauth/callback` with a request-derived redirect URI so both flows coexist during cutover.
- Cookie: `HttpOnly; Secure; SameSite=None; Path=/` — `None` is required while the SPA and Worker API are on different sites; switch to `Lax` once the SPA calls same-origin `/api/*`.
- Idle session TTL 24h, absolute TTL 30d; rotation on authentication; revoke-all support.
- `AUTH_STORE` on `WorkerEnv` is a test seam only; production always uses the D1 adapter.
- Legacy account migration is explicit and dry-run by default; SQL emission requires owner review.

## Left to the owner

- Apply migration `0005_builly_identity.sql` to the target D1 database.
- Set Google OAuth secrets and preserve `TOKEN_ENCRYPTION_KEY`.
- Authorize the new redirect URI in Google Cloud Console.
- Supply explicit legacy-owner → Google-subject mappings and review emitted SQL.
- Deploy after approval, then verify live OAuth and regression flows.
