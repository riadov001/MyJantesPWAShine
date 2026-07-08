/**
 * Bidirectional database sync utility.
 *
 * Copies all data from a source PostgreSQL database to a target PostgreSQL
 * database, table by table. Schema must already exist on the target (use
 * `npm run db:push` first if needed).
 *
 * Usage:
 *   npm run sync:db -- --from=dev --to=prod
 *   npm run sync:db -- --from=prod --to=dev
 *   npm run sync:db -- --from-url="postgres://..." --to-url="postgres://..."
 *
 * Required env vars (depending on aliases used):
 *   DEV_DATABASE_URL          dev database connection string
 *   PRODUCTION_DATABASE_URL   prod database connection string
 *   DATABASE_URL              fallback (used as dev if DEV_DATABASE_URL missing)
 *
 * Behavior:
 *   - Truncates target tables (CASCADE) before copying.
 *   - Copies only columns that exist in BOTH source and target.
 *   - Disables FK checks during copy via session_replication_role.
 *   - JSON / JSONB columns are stringified before insert.
 *   - Fails loudly if any table copy errors out.
 */

import { Pool } from 'pg';

type Direction = 'dev' | 'prod';

function getUrl(alias: Direction): string {
  if (alias === 'dev') {
    const url = process.env.DEV_DATABASE_URL || process.env.DEV_DB_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('DEV_DATABASE_URL (or DATABASE_URL) must be set');
    return url;
  }
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.PROD_DATABASE_URL;
  if (!url) {
    throw new Error(
      'PRODUCTION_DATABASE_URL (or PROD_DATABASE_URL) must be set for prod operations',
    );
  }
  return url;
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  let fromUrl = args['from-url'];
  let toUrl = args['to-url'];

  if (!fromUrl && args.from) fromUrl = getUrl(args.from as Direction);
  if (!toUrl && args.to) toUrl = getUrl(args.to as Direction);

  if (!fromUrl || !toUrl) {
    throw new Error(
      'Usage: --from=dev|prod --to=dev|prod  OR  --from-url=... --to-url=...',
    );
  }
  return { fromUrl, toUrl, fromLabel: args.from || 'src', toLabel: args.to || 'dst' };
}

async function getTables(pool: Pool): Promise<string[]> {
  const res = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  return res.rows.map((r) => r.tablename);
}

async function getColumns(pool: Pool, table: string): Promise<string[]> {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table],
  );
  return res.rows.map((r) => r.column_name);
}

async function getJsonColumns(pool: Pool, table: string): Promise<Set<string>> {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
       AND data_type IN ('json', 'jsonb')`,
    [table],
  );
  return new Set(res.rows.map((r) => r.column_name));
}

// Best-effort topological order (parents before children) for FK-safe copy.
const TABLE_ORDER = [
  'garages',
  'users',
  'sessions',
  'password_reset_tokens',
  'services',
  'application_settings',
  'engagements',
  'workflows',
  'workflow_steps',
  'service_workflows',
  'expense_categories',
  'external_apis',
  'notification_rules',
  'invoice_counters',
  'delivery_note_counters',
  'credit_note_counters',
  'expense_counters',
  'accounting_entry_counters',
  'vehicles',
  'quotes',
  'quote_items',
  'quote_media',
  'invoices',
  'invoice_items',
  'invoice_media',
  'delivery_notes',
  'delivery_note_invoices',
  'credit_notes',
  'credit_note_items',
  'expenses',
  'reservations',
  'reservation_services',
  'workshop_tasks',
  'repair_orders',
  'reviews',
  'notifications',
  'chat_conversations',
  'chat_participants',
  'chat_messages',
  'chat_attachments',
  'audit_logs',
  'audit_log_changes',
  'accounting_entries',
  'accounting_lines',
  'fec_exports',
  'ocr_scans',
  'sms_logs',
  'ai_analysis_history',
  'device_tokens',
];

async function copyTable(
  source: Pool,
  target: Pool,
  table: string,
  columns: string[],
  jsonCols: Set<string>,
): Promise<number> {
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

  const srcRes = await source.query(`SELECT ${colList} FROM "${table}"`);
  if (srcRes.rows.length === 0) {
    console.log(`  ${table}: 0 rows`);
    return 0;
  }

  const client = await target.connect();
  let inserted = 0;
  try {
    await client.query("SET session_replication_role = 'replica'");
    await client.query('BEGIN');
    const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;
    for (const row of srcRes.rows) {
      const values = columns.map((c) => {
        const v = row[c];
        if (v != null && jsonCols.has(c) && typeof v !== 'string') {
          return JSON.stringify(v);
        }
        return v;
      });
      const r = await client.query(sql, values);
      inserted += r.rowCount || 0;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    try {
      await client.query("SET session_replication_role = 'origin'");
    } catch {
      // best-effort reset before release
    }
    client.release();
  }
  console.log(`  ${table}: ${inserted}/${srcRes.rows.length} rows`);
  return inserted;
}

async function main() {
  const { fromUrl, toUrl, fromLabel, toLabel } = parseArgs(process.argv.slice(2));

  if (fromUrl === toUrl) {
    throw new Error('Source and target URLs are identical — refusing to sync.');
  }

  const source = new Pool({ connectionString: fromUrl });
  const target = new Pool({ connectionString: toUrl });

  console.log(`\nSyncing ${fromLabel} -> ${toLabel}`);
  console.log('Discovering tables...');
  const srcTables = new Set(await getTables(source));
  const dstTables = new Set(await getTables(target));
  const common = [...srcTables].filter((t) => dstTables.has(t));
  console.log(`  source tables: ${srcTables.size}`);
  console.log(`  target tables: ${dstTables.size}`);
  console.log(`  common: ${common.length}`);

  const ordered: string[] = [];
  for (const t of TABLE_ORDER) if (common.includes(t)) ordered.push(t);
  for (const t of common) if (!ordered.includes(t)) ordered.push(t);

  console.log('\nTruncating target tables...');
  const trClient = await target.connect();
  try {
    await trClient.query("SET session_replication_role = 'replica'");
    const list = ordered.map((t) => `"${t}"`).join(', ');
    await trClient.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  } finally {
    try {
      await trClient.query("SET session_replication_role = 'origin'");
    } catch {
      // ignore
    }
    trClient.release();
  }

  console.log('\nCopying data...');
  let total = 0;
  const failed: string[] = [];
  for (const table of ordered) {
    const srcCols = await getColumns(source, table);
    const dstCols = await getColumns(target, table);
    const dstSet = new Set(dstCols);
    const commonCols = srcCols.filter((c) => dstSet.has(c));
    const skipped = srcCols.filter((c) => !dstSet.has(c));
    if (skipped.length) {
      console.log(`  ${table}: skipping columns [${skipped.join(', ')}]`);
    }
    if (commonCols.length === 0) {
      console.log(`  ${table}: SKIP (no common columns)`);
      continue;
    }
    const jsonCols = await getJsonColumns(target, table);
    try {
      total += await copyTable(source, target, table, commonCols, jsonCols);
    } catch (e: any) {
      console.error(`  ${table}: FAILED - ${e.message}`);
      failed.push(table);
    }
  }

  console.log(`\nTotal rows copied: ${total}`);
  if (failed.length) {
    console.error(`Failed tables: ${failed.join(', ')}`);
    await source.end();
    await target.end();
    process.exit(1);
  }

  await source.end();
  await target.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
