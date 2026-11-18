# Builly — Phased Implementation Plan

## Phase 0 — Reconnaissance
Inspect routes, app entry, auth services, Firebase/Supabase, Google OAuth, Drive/Sheets adapters, localStorage persistence, CMS, Builder modules, logo/font assets and tests. Record baseline build/typecheck. No destructive changes.

## Phase 1 — Landing Page
Add `/` as Landing Page. Preserve existing Builder routes and deep links. Implement responsive Professional Spatial UI, 60/30/10 palette, existing brand assets, Lucide icons, accessible focus and reduced motion. CTA uses real auth integration when configured. Gate: desktop/tablet/mobile and old Builder route verified.

## Phase 2 — Supabase identity
Add Supabase client/config, Google sign-in, callback/session restore/sign-out/error states, owner identity from Supabase user ID, protected Builder route and return destination. Do not request Drive/Sheets scopes in sign-in. Remove Firebase only after parity and regression. Gate: sign-in/reload/sign-out/expired session/protected route tests.

## Phase 3 — Workspace OAuth
Add Worker OAuth start/callback/status/disconnect. Verify Supabase identity and bind credentials to owner. Encrypt refresh token server-side. Refactor Drive/Sheets calls through Worker. Gate: connect/reconnect/revoke/cancel/partial scope/wrong account/token refresh tests.

## Phase 4 — Builder storage
Audit storageService and Drive registry. Define Drive folder/file and Sheets schemas. Persist page JSON/source/assets in owner Drive and structured content in owner Sheets. localStorage only for preferences/transient state. Provide explicit local draft migration/recovery. Gate: owner isolation and Builder/CMS regression.

## Phase 5 — Cloudflare delivery
Configure Cloudflare frontend hosting and Worker routing, staging/production environments, immutable publish artifacts and atomic activation. Failed publish preserves previous live version. R2 optional. Gate: deploy/routes/publish/update/unpublish/rollback/cache tests.

## Phase 6 — Hardening
Remove Firebase only after all dependencies migrated. Remove obsolete local persistence only after recovery exists. Security, dependency, accessibility, performance and regression review. Update docs/env examples.

## Regression checklist
Landing + Builder routes; login/session; Workspace connect/disconnect; Builder open/save/reload; drag/drop/reparent/delete; undo/redo; responsive styles; multi-page; header/footer; CMS/dynamic binding; Drive/Sheets; demo isolation; Save vs Publish; failed publish preserves live version.

## Review policy
Feature branch, focused commits, typecheck/build/tests, inspect diff for secrets/data deletion/unrelated refactors, PR review, owner approval before merge.
