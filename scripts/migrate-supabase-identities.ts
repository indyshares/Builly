/**
 * Dry-run first (default). Emits additive SQL but never touches production.
 * Usage:
 *   npx tsx scripts/migrate-supabase-identities.ts mappings.json
 *   npx tsx scripts/migrate-supabase-identities.ts mappings.json --emit migration.sql
 *
 * mappings.json: [{ "legacyOwnerId": "...", "googleSubject": "...", "email": "..." }]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildLegacyIdentityMigration } from '../worker/src/services/legacyIdentityMigration';
import type { LegacyIdentityMapping } from '../worker/src/services/legacyIdentityMigration';

const [, , inputPath, emitFlag, outputPath] = process.argv;
if (!inputPath) {
  console.error('Usage: tsx scripts/migrate-supabase-identities.ts <mappings.json> [--emit <sql-file>]');
  process.exit(1);
}

const rows = JSON.parse(readFileSync(inputPath, 'utf8')) as LegacyIdentityMapping[];
const report = buildLegacyIdentityMigration(rows);

console.log(`DRY RUN — accounts mapped: ${report.mappedAccounts}`);
console.log(`Statements: ${report.statements.length}`);
for (const warning of report.warnings) console.log(`WARNING: ${warning}`);
console.log('No production data was modified.');

if (emitFlag === '--emit' && outputPath) {
  const header = '-- Explicit Builly identity migration. Review before applying. Additive only.\n';
  writeFileSync(outputPath, header + report.statements.join('\n') + '\n');
  console.log(`SQL written to ${outputPath}`);
}
