# Google Drive Scope Assessment — Restricted Scope `drive`

**Status: local implementation only. Google verification and restricted-scope security assessment have NOT been completed.**

## Final scope set (Worker authoritative)

Source: `worker/src/config/googleScopes.ts`.

- Identity: `openid`, `email`, `profile`
- Workspace:
  - `https://www.googleapis.com/auth/drive` **(approved Restricted Scope)**
  - `https://www.googleapis.com/auth/spreadsheets`
  - `https://www.googleapis.com/auth/drive.file` (retained pending complete call audit)
  - `https://www.googleapis.com/auth/drive.metadata.readonly` (retained pending complete call audit)

No unrelated scopes added.

## Why full Drive access

Builly's canonical business data lives in the user's `My Drive/Builly/`: system manifests, organization/project manifests, resource registry, configuration JSON, CMS and Inbox spreadsheets, assets, and published artifacts. Most of these files predate the current OAuth client. `drive.file` grants content access only to files created or explicitly selected for this app; metadata listing alone (`drive.metadata.readonly`) cannot read or update their contents. An explicit Picker/adoption migration would be required to keep `drive.file`; the owner chose Option B instead.

## Operation compatibility

| Operation | Current scope support |
|---|---|
| List/search files and read metadata (`files.list`, `files.get` fields) | `drive` (also `drive.metadata.readonly`) |
| Read content of pre-existing JSON manifests (`alt=media`) | `drive` only |
| Create new files/folders | `drive` |
| Update content of pre-existing files (`files.update` multipart) | `drive` only |
| Update metadata, move, trash/delete | `drive` |
| Copy files (`files.copy`) | `drive` (also `drive.readonly`/`drive`; `spreadsheets` alone is insufficient) |
| Read published artifacts/asset bytes | `drive` |
| Sheets API read/write by ID | `spreadsheets` |
| CMS/Inbox spreadsheets | `spreadsheets` (+ `drive` for file-level operations) |

Representative call sites: `worker/src/services/driveManifestService.ts`, `driveCanonicalClient.ts`, `driveProvisioner.ts`, `worker/src/routes/drive.ts`, `sheets.ts`, `ownerPublish.ts`, `publicRuntime.ts`, `projectMigration.ts`, and client GIS flows in `src/services/`.

## Additional consent / reconnect

- Existing Builly Account IDs, Organization/Project IDs, and Drive files are unchanged.
- The Worker does not replace an existing encrypted refresh token when Google returns no `refresh_token` (`worker/src/routes/auth.ts`); the existing credential remains usable.
- A user who previously granted only `drive.file` must explicitly re-authorize with the full `drive` scope via Workspace reconnect. The reconnect flow uses the distinct callback `/api/google/oauth/callback` and the same centralized scope set.
- Insufficient scopes must be surfaced as `needs_reauth`/reconnect-required, not as account disconnect. Consent denial must not delete the Builly Account or stored credential.
- Consent is not forced on every normal login.

## Data handling and controls

- Refresh tokens encrypted with AES-256-GCM (`worker/src/security/encryption.ts`), stored only in D1 `workspace_credentials`, never returned to the browser.
- D1 stores identity, sessions, operational indexes, and encrypted credentials; canonical business data remains in Drive.
- Session tokens are opaque, HttpOnly cookies; only SHA-256 hashes are stored.
- Diagnostics expose only flags/fingerprints; no token or secret values.
- Disconnect revokes the Google grant and deletes only the Workspace credential row; the Builly Account remains.

## Google verification preparation checklist (not yet done)

1. Configure the Restricted Scope in Google Cloud Console OAuth consent screen.
2. Publish OAuth app / complete verification and any required security assessment.
3. Add authorized redirect URIs: `/api/auth/google/callback` and `/api/google/oauth/callback`.
4. Prepare privacy policy, data-use declaration, and demo video if requested.
5. Restrict the OAuth client to the authorized domain.
6. Document least-privilege justification and data retention/deletion behavior.
7. Re-test consent screen after verification; do not claim verification beforehand.

## Rollout

Owner approval required for Google Cloud Console changes, production secrets/vars, and deployment. Rollback: revert scope var and re-consent; existing credentials remain encrypted and are not deleted by this change.
