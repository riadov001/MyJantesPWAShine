import { Pool } from 'pg';

const NEON_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.DATABASE_URL;

if (!NEON_URL) throw new Error('SOURCE_DATABASE_URL (Neon connection string) must be set');
if (!TARGET_URL) throw new Error('DATABASE_URL (target Replit DB) must be set');

const sourcePool = new Pool({ connectionString: NEON_URL });
const targetPool = new Pool({ connectionString: TARGET_URL });

async function getTables(pool: Pool): Promise<string[]> {
  const res = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
  return res.rows.map(r => r.tablename);
}

async function getColumns(pool: Pool, table: string): Promise<string[]> {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table]
  );
  return res.rows.map(r => r.column_name);
}

async function getJsonColumns(pool: Pool, table: string): Promise<Set<string>> {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND data_type IN ('json', 'jsonb')`,
    [table]
  );
  return new Set(res.rows.map(r => r.column_name));
}

// Order matters for FK constraints - but we'll disable triggers via session_replication_role
// Best-effort topological ordering: parent tables first
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
];

async function copyTable(table: string, columns: string[], jsonCols: Set<string>) {
  const colList = columns.map(c => `"${c}"`).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

  const srcRes = await sourcePool.query(`SELECT ${colList} FROM "${table}"`);
  const rows = srcRes.rows;

  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows`);
    return 0;
  }

  const client = await targetPool.connect();
  let inserted = 0;
  try {
    await client.query("SET session_replication_role = 'replica'");
    await client.query('BEGIN');
    const insertSql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
    for (const row of rows) {
      const values = columns.map(c => {
        const v = row[c];
        if (v != null && jsonCols.has(c) && typeof v !== 'string') {
          return JSON.stringify(v);
        }
        return v;
      });
      try {
        const r = await client.query(insertSql, values);
        inserted += r.rowCount || 0;
      } catch (e: any) {
        console.error(`    error in ${table}: ${e.message}`);
        throw e;
      }
    }
    await client.query('COMMIT');
    await client.query("SET session_replication_role = 'origin'");
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  console.log(`  ${table}: ${inserted}/${rows.length} rows`);
  return inserted;
}

async function main() {
  console.log('Discovering tables...');
  const srcTables = new Set(await getTables(sourcePool));
  const dstTables = new Set(await getTables(targetPool));
  const common = [...srcTables].filter(t => dstTables.has(t));
  console.log(`Common tables: ${common.length}`);

  // Order: known order first, then any remaining common tables
  const ordered: string[] = [];
  for (const t of TABLE_ORDER) {
    if (common.includes(t)) ordered.push(t);
  }
  for (const t of common) {
    if (!ordered.includes(t)) ordered.push(t);
  }

  // Truncate all in reverse order
  console.log('Truncating target tables...');
  const client = await targetPool.connect();
  try {
    await client.query("SET session_replication_role = 'replica'");
    const truncList = ordered.map(t => `"${t}"`).join(', ');
    await client.query(`TRUNCATE TABLE ${truncList} RESTART IDENTITY CASCADE`);
    await client.query("SET session_replication_role = 'origin'");
  } finally {
    client.release();
  }

  console.log('Copying data...');
  let total = 0;
  for (const table of ordered) {
    const srcCols = await getColumns(sourcePool, table);
    const dstCols = await getColumns(targetPool, table);
    const dstSet = new Set(dstCols);
    const commonCols = srcCols.filter(c => dstSet.has(c));
    const skipped = srcCols.filter(c => !dstSet.has(c));
    if (skipped.length) console.log(`  ${table}: skipping columns [${skipped.join(', ')}]`);
    if (commonCols.length === 0) {
      console.log(`  ${table}: SKIP (no common columns)`);
      continue;
    }
    const jsonCols = await getJsonColumns(targetPool, table);
    try {
      total += await copyTable(table, commonCols, jsonCols);
    } catch (e: any) {
      console.error(`  ${table}: FAILED - ${e.message}`);
    }
  }
  console.log(`\nTotal rows imported: ${total}`);

  await sourcePool.end();
  await targetPool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
