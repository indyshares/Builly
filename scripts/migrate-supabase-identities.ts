/**
 * Dry-run only. Never applies remote SQL.
 *
 * Usage:
 *   npx tsx scripts/migrate-supabase-identities.ts mappings.json --preflight preflight.json [--emit migration.sql]
 *
 * preflight.json must be produced by an owner after live read-only D1 checks:
 * {
 *   "verified": true,
 *   "migration0005Applied": true,
 *   "ownerAttestedSubjects": true,
 *   "existingAccountIds": ["..."],
 *   "existingSubjects": [{"provider":"google","subject":"...","accountId":"..."}]
 * }
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  buildLegacyIdentityMigration,
  type LegacyIdentityMapping,
  type LegacyMigrationPreflight,
} from '../worker/src/services/legacyIdentityMigration';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: tsx scripts/migrate-supabase-identities.ts <mappings.json> --preflight <preflight.json> [--emit <sql-file>]');
  process.exit(2);
}

const [inputPath, preflightFlag, preflightPath, emitFlag, outputPath] = args;
if (preflightFlag !== '--preflight' || !preflightPath) {
  console.error('PREFLIGHT NOT VERIFIED — refusing to emit SQL.');
  process.exit(2);
}

const rawInput = readFileSync(inputPath, 'utf8');
const rows = JSON.parse(rawInput) as LegacyIdentityMapping[];
const preflight = JSON.parse(readFileSync(preflightPath, 'utf8')) as LegacyMigrationPreflight;
const report = buildLegacyIdentityMigration(rows, preflight);

console.log('BUILLY LEGACY IDENTITY MIGRATION — DRY RUN');
console.log(`Input: ${inputPath}`);
console.log(`Input SHA256: ${createHash('sha256').update(rawInput).digest('hex')}`);
console.log(`Preflight verified: ${report.verified ? 'YES' : 'NO — NOT VERIFIED'}`);
console.log(`Rows: ${rows.length}  Mapped: ${report.mappedAccounts}`);
for (const warning of report.warnings) console.log(`WARNING: ${warning}`);
for (const error of report.errors) console.log(`ERROR: ${error}`);
console.log(`Statements: ${report.statements.length}`);
console.log('Production D1 not contacted. No SQL applied.');

if (!report.ok) {
  console.error('MIGRATION BLOCKED — no SQL emitted.');
  process.exit(1);
}

if (emitFlag === '--emit' && outputPath) {
  writeFileSync(outputPath, '-- Reviewed migration SQL. Additive only.\n' + report.statements.join('\n') + '\n');
  console.log(`SQL written to ${outputPath} (review required before owner applies it).`);
}
