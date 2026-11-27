import { describe, expect, it } from 'vitest';
import { buildLegacyIdentityMigration } from '../services/legacyIdentityMigration';

describe('legacy identity migration', () => {
  it('maps explicit legacy owner ids to Google subjects without email-based merging', () => {
    const report = buildLegacyIdentityMigration([
      { legacyOwnerId: 'legacy-1', googleSubject: 'google-sub-1', email: 'a@example.com' },
      { legacyOwnerId: 'legacy-2', googleSubject: 'google-sub-2', email: 'b@example.com' },
    ]);
    expect(report.mappedAccounts).toBe(2);
    expect(report.statements.join('\n')).toContain("'google', 'google-sub-1', 'legacy-1'");
    expect(report.statements.join('\n')).toContain("'google', 'google-sub-2', 'legacy-2'");
    expect(report.warnings).toEqual([]);
  });

  it('flags duplicate subjects and duplicate legacy ids instead of merging', () => {
    const report = buildLegacyIdentityMigration([
      { legacyOwnerId: 'legacy-1', googleSubject: 'google-sub-1' },
      { legacyOwnerId: 'legacy-2', googleSubject: 'google-sub-1' },
      { legacyOwnerId: 'legacy-1', googleSubject: 'google-sub-2' },
    ]);
    expect(report.mappedAccounts).toBe(1);
    expect(report.warnings.length).toBe(2);
  });

  it('does not reinsert an account that already exists', () => {
    const report = buildLegacyIdentityMigration(
      [{ legacyOwnerId: 'legacy-1', googleSubject: 'google-sub-1' }],
      new Set(['legacy-1'])
    );
    expect(report.statements.some((s) => s.startsWith('INSERT OR IGNORE INTO accounts'))).toBe(false);
    expect(report.statements.some((s) => s.startsWith('INSERT OR IGNORE INTO external_identities'))).toBe(true);
  });
});
