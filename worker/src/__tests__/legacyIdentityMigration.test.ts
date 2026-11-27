import { describe, expect, it } from 'vitest';
import {
  buildLegacyIdentityMigration,
  type LegacyMigrationPreflight,
} from '../services/legacyIdentityMigration';

const verified: LegacyMigrationPreflight = {
  verified: true,
  migration0005Applied: true,
  ownerAttestedSubjects: true,
  existingAccountIds: [],
  existingSubjects: [],
};

describe('fail-closed legacy identity migration', () => {
  it('refuses to emit SQL without verified preflight', () => {
    const report = buildLegacyIdentityMigration(
      [{ legacyOwnerId: 'legacy-1', googleSubject: 'sub-1' }],
      undefined
    );
    expect(report.ok).toBe(false);
    expect(report.statements).toEqual([]);
    expect(report.errors.join(' ')).toContain('NOT VERIFIED');
  });

  it('blocks duplicate Google subjects and duplicate legacy IDs', () => {
    const report = buildLegacyIdentityMigration(
      [
        { legacyOwnerId: 'legacy-1', googleSubject: 'sub-1' },
        { legacyOwnerId: 'legacy-2', googleSubject: 'sub-1' },
        { legacyOwnerId: 'legacy-1', googleSubject: 'sub-2' },
      ],
      verified
    );
    expect(report.ok).toBe(false);
    expect(report.errors.length).toBe(2);
    expect(report.statements).toEqual([]);
  });

  it('blocks a subject already mapped to a different account', () => {
    const report = buildLegacyIdentityMigration(
      [{ legacyOwnerId: 'legacy-1', googleSubject: 'sub-1' }],
      {
        ...verified,
        existingSubjects: [{ provider: 'google', subject: 'sub-1', accountId: 'other-account' }],
      }
    );
    expect(report.ok).toBe(false);
    expect(report.errors.join(' ')).toContain('different account');
  });

  it('blocks malformed fields and never merges by email', () => {
    const report = buildLegacyIdentityMigration(
      [
        { legacyOwnerId: '', googleSubject: 'sub-1', email: 'a@example.com' },
        { legacyOwnerId: 'legacy-2', googleSubject: '', email: 'a@example.com' },
      ],
      verified
    );
    expect(report.ok).toBe(false);
    expect(report.statements).toEqual([]);
  });

  it('emits deterministic idempotent SQL for a verified mapping', () => {
    const rows = [{ legacyOwnerId: 'legacy-1', googleSubject: 'sub-1', email: 'a@example.com' }];
    const first = buildLegacyIdentityMigration(rows, verified);
    const second = buildLegacyIdentityMigration(rows, verified);
    expect(first.ok).toBe(true);
    expect(first.statements).toEqual(second.statements);
    expect(first.statements.join('\n')).toContain('INSERT OR IGNORE INTO accounts');
    expect(first.statements.join('\n')).toContain('INSERT OR IGNORE INTO external_identities');
  });

  it('skips account insert for an existing account but still maps the identity', () => {
    const report = buildLegacyIdentityMigration(
      [{ legacyOwnerId: 'legacy-1', googleSubject: 'sub-1' }],
      { ...verified, existingAccountIds: ['legacy-1'] }
    );
    expect(report.ok).toBe(true);
    expect(report.statements.some((s) => s.startsWith('INSERT OR IGNORE INTO accounts'))).toBe(false);
    expect(report.statements.some((s) => s.startsWith('INSERT OR IGNORE INTO external_identities'))).toBe(true);
  });
});
