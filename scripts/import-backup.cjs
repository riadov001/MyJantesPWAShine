const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function convertKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(convertKeys);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[toSnakeCase(k)] = v;
    }
    return out;
  }
  return obj;
}

function serializeValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' || Array.isArray(v)) return JSON.stringify(v);
  return v;
}

// JSON table name → DB table name
const TABLE_MAP = {
  garages: 'garages',
  users: 'users',
  services: 'services',
  invoiceCounters: 'invoice_counters',
  applicationSettings: 'application_settings',
  quotes: 'quotes',
  quoteItems: 'quote_items',
  quoteMedia: 'quote_media',
  invoices: 'invoices',
  invoiceItems: 'invoice_items',
  invoiceMedia: 'invoice_media',
  reservations: 'reservations',
  reservationServices: 'reservation_services',
  notifications: 'notifications',
  engagements: 'engagements',
  workflows: 'workflows',
  workflowSteps: 'workflow_steps',
  serviceWorkflows: 'service_workflows',
  workshopTasks: 'workshop_tasks',
  auditLogs: 'audit_logs',
  auditLogChanges: 'audit_log_changes',
  chatConversations: 'chat_conversations',
  chatParticipants: 'chat_participants',
  chatMessages: 'chat_messages',
  chatAttachments: 'chat_attachments',
};

// Import order respecting FK constraints
const IMPORT_ORDER = [
  'garages', 'users', 'services', 'invoiceCounters', 'applicationSettings',
  'quotes', 'quoteItems', 'quoteMedia',
  'invoices', 'invoiceItems', 'invoiceMedia',
  'reservations', 'reservationServices',
  'notifications', 'engagements',
  'workflows', 'workflowSteps', 'serviceWorkflows', 'workshopTasks',
  'auditLogs', 'auditLogChanges',
  'chatConversations', 'chatParticipants', 'chatMessages', 'chatAttachments',
];

async function getTableColumns(tableName) {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [tableName]
  );
  return r.rows.map(r => r.column_name);
}

async function upsertTable(jsonKey, rows, dbColumns) {
  const dbTable = TABLE_MAP[jsonKey];
  if (!rows || rows.length === 0) {
    console.log(`  ${dbTable}: 0 lignes — ignoré`);
    return { inserted: 0, updated: 0, errors: 0 };
  }

  let inserted = 0, updated = 0, errors = 0;

  for (const rawRow of rows) {
    const row = convertKeys(rawRow);
    // Only keep columns that exist in DB
    const filteredCols = Object.keys(row).filter(k => dbColumns.includes(k));
    if (filteredCols.length === 0) continue;

    const values = filteredCols.map(k => serializeValue(row[k]));
    const colList = filteredCols.map(c => `"${c}"`).join(', ');
    const placeholders = filteredCols.map((_, i) => `$${i + 1}`).join(', ');
    const updateSet = filteredCols
      .filter(c => c !== 'id')
      .map((c, i) => `"${c}" = EXCLUDED."${c}"`)
      .join(', ');

    const sql = `INSERT INTO "${dbTable}" (${colList}) VALUES (${placeholders})
      ON CONFLICT (id) DO UPDATE SET ${updateSet}`;

    try {
      const result = await pool.query(sql, values);
      if (result.rowCount > 0) inserted++;
      else updated++;
    } catch (err) {
      errors++;
      if (errors <= 3) console.error(`    ⚠ Erreur sur ${dbTable} id=${row.id}: ${err.message.split('\n')[0]}`);
    }
  }

  return { inserted, updated, errors };
}

async function main() {
  const jsonPath = path.resolve('attached_assets/myjantes-data-2026-05-27_1780305997525.json');
  console.log(`\n📂 Lecture de ${path.basename(jsonPath)}...`);
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const backup = JSON.parse(raw);
  const data = backup.data;

  console.log(`📅 Export du: ${backup.exportedAt}`);
  console.log(`📊 Tables: ${Object.keys(data).length}\n`);

  // Pre-fetch all column definitions
  const columnCache = {};
  for (const jsonKey of IMPORT_ORDER) {
    const dbTable = TABLE_MAP[jsonKey];
    columnCache[jsonKey] = await getTableColumns(dbTable);
  }

  let totalInserted = 0, totalErrors = 0;

  for (const jsonKey of IMPORT_ORDER) {
    const rows = data[jsonKey] || [];
    const dbTable = TABLE_MAP[jsonKey];
    const cols = columnCache[jsonKey];

    process.stdout.write(`  📥 ${dbTable.padEnd(25)} ${rows.length} lignes... `);
    const { inserted, updated, errors } = await upsertTable(jsonKey, rows, cols);
    totalInserted += inserted + updated;
    totalErrors += errors;
    console.log(`✅ ${inserted + updated} upsertés${errors > 0 ? ` ⚠ ${errors} erreurs` : ''}`);
  }

  console.log(`\n✅ Import terminé: ${totalInserted} lignes importées, ${totalErrors} erreurs`);
  await pool.end();
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err.message);
  process.exit(1);
});
