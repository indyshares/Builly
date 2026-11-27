# Retained Supabase references (historical only)

These files mention Supabase as historical documentation or audit records. They are **not** runtime code, build configuration, or active environment variables. Do not treat them as current setup instructions.

- `docs/SETUP_AND_MIGRATION.md` — legacy setup guide; superseded by `docs/AUTH_SETUP.md`.
- `README.md`, `README-EN.md` — historical sections describing the retired identity provider.
- `WORKSPACE_ARCHITECTURE_AUDIT.md`, `SHARED_RUNTIME_AUDIT.md`, `CMS_RELIABILITY_AUDIT.md`, `SHEET_STRUCTURE_INVENTORY.md`, `BUILDER_*` audits — point-in-time audits.
- `public/assets/aistudio/*.md` — archived AI Studio specifications served as static assets.

Current architecture: see `docs/superpowers/specs/2026-11-27-builly-direct-google-oauth-design.md`.

Active source, config, tests, and built bundles contain zero Supabase runtime dependencies.
