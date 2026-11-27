/**
 * Controlled migration from legacy third-party owner IDs to Builly accounts.
 * Explicit mapping only. Email is metadata and NEVER merges accounts.
 * Production-ready SQL is emitted only after a verified, owner-attested preflight.
 */

export interface LegacyIdentityMapping {
  legacyOwnerId: string;
  googleSubject: string;
  email?: string;
  displayName?: string;
}

export interface LegacyMigrationPreflight {
  verified: boolean;
  migration0005Applied: boolean;
  ownerAttestedSubjects: boolean;
  existingAccountIds: string[];
  existingSubjects: Array<{ provider: string; subject: string; accountId: string }>;
}

export interface LegacyMigrationReport {
  ok: boolean;
  statements: string[];
  errors: string[];
  warnings: string[];
  mappedAccounts: number;
  verified: boolean;
}

export const MIGRATION_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function sqlText(value: string): string {
  if (!/^[^\x00-\x1f]*$/.test(value)) throw new Error('ILLEGAL_IDENTITY_VALUE');
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildLegacyIdentityMigration(
  rows: LegacyIdentityMapping[],
  preflight?: LegacyMigrationPreflight
): LegacyMigrationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const statements: string[] = [];
  const verified = Boolean(
    preflight?.verified &&
      preflight.migration0005Applied &&
      preflight.ownerAttestedSubjects
  );

  if (!preflight || !verified) {
    errors.push(
      'PREFLIGHT NOT VERIFIED: migration 0005 applied, live D1 account/identity checks, and explicit owner subject attestation are all required.'
    );
  }

  const seenSubjects = new Map<string, string>();
  const seenLegacyIds = new Set<string>();
  const existingAccounts = new Set(preflight?.existingAccountIds || []);
  const existingSubjects = new Map(
    (preflight?.existingSubjects || []).map((entry) => [`${entry.provider}:${entry.subject}`, entry.accountId])
  );

  for (const row of rows) {
    if (!row.legacyOwnerId?.trim() || !row.googleSubject?.trim()) {
      errors.push('Missing or malformed legacyOwnerId/googleSubject; migration blocked.');
      continue;
    }
    if (seenSubjects.has(row.googleSubject)) {
      errors.push(`Duplicate Google subject ${row.googleSubject}; migration blocked.`);
      continue;
    }
    if (seenLegacyIds.has(row.legacyOwnerId)) {
      errors.push(`Duplicate legacy account ${row.legacyOwnerId}; migration blocked.`);
      continue;
    }
    const mappedAccount = existingSubjects.get(`google:${row.googleSubject}`);
    if (mappedAccount && mappedAccount !== row.legacyOwnerId) {
      errors.push(
        `Google subject ${row.googleSubject} is already mapped to a different account; migration blocked.`
      );
      continue;
    }
    seenSubjects.set(row.googleSubject, row.legacyOwnerId);
    seenLegacyIds.add(row.legacyOwnerId);

    const now = sqlText(MIGRATION_TIMESTAMP);
    if (!existingAccounts.has(row.legacyOwnerId)) {
      statements.push(
        `INSERT OR IGNORE INTO accounts (id, status, email, display_name, avatar_url, created_at, updated_at) VALUES (` +
          `${sqlText(row.legacyOwnerId)}, 'active', ${sqlText(row.email || '')}, ${sqlText(row.displayName || '')}, '', ${now}, ${now});`
      );
    } else {
      warnings.push(`Account ${row.legacyOwnerId} already exists; account insert skipped.`);
    }
    statements.push(
      `INSERT OR IGNORE INTO external_identities (provider, subject, account_id, email, email_verified, created_at, updated_at) VALUES (` +
        `'google', ${sqlText(row.googleSubject)}, ${sqlText(row.legacyOwnerId)}, ${sqlText(row.email || '')}, 1, ${now}, ${now});`
    );
  }

  return {
    ok: errors.length === 0,
    statements: errors.length === 0 ? statements : [],
    errors,
    warnings,
    mappedAccounts: seenLegacyIds.size,
    verified,
  };
}
