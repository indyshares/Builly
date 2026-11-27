/**
 * Controlled migration from legacy Supabase owner IDs to Builly accounts.
 * Mapping is explicit: a Google subject must be supplied by the owner. Email is metadata
 * only and is NEVER used to merge accounts automatically.
 */

export interface LegacyIdentityMapping {
  legacyOwnerId: string;
  googleSubject: string;
  email?: string;
  displayName?: string;
}

export interface LegacyMigrationReport {
  statements: string[];
  warnings: string[];
  mappedAccounts: number;
}

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildLegacyIdentityMigration(
  rows: LegacyIdentityMapping[],
  existingAccountIds: ReadonlySet<string> = new Set()
): LegacyMigrationReport {
  const statements: string[] = [];
  const warnings: string[] = [];
  const seenSubjects = new Set<string>();
  const seenLegacyIds = new Set<string>();
  const now = sqlText(new Date().toISOString());

  for (const row of rows) {
    if (!row.legacyOwnerId || !row.googleSubject) {
      warnings.push('Skipped a row without legacyOwnerId or googleSubject.');
      continue;
    }
    if (seenSubjects.has(row.googleSubject)) {
      warnings.push(`Duplicate Google subject for ${row.legacyOwnerId}; skipped.`);
      continue;
    }
    if (seenLegacyIds.has(row.legacyOwnerId)) {
      warnings.push(`Duplicate legacy owner id ${row.legacyOwnerId}; skipped.`);
      continue;
    }
    seenSubjects.add(row.googleSubject);
    seenLegacyIds.add(row.legacyOwnerId);

    if (!existingAccountIds.has(row.legacyOwnerId)) {
      statements.push(
        `INSERT OR IGNORE INTO accounts (id, status, email, display_name, avatar_url, created_at, updated_at) VALUES (` +
          `${sqlText(row.legacyOwnerId)}, 'active', ${sqlText(row.email || '')}, ${sqlText(row.displayName || '')}, '', ${now}, ${now});`
      );
    }
    statements.push(
      `INSERT OR IGNORE INTO external_identities (provider, subject, account_id, email, email_verified, created_at, updated_at) VALUES (` +
        `'google', ${sqlText(row.googleSubject)}, ${sqlText(row.legacyOwnerId)}, ${sqlText(row.email || '')}, 0, ${now}, ${now});`
    );
  }

  return { statements, warnings, mappedAccounts: seenLegacyIds.size };
}
