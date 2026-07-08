import { pool } from "./db";
import { sql } from "drizzle-orm";
import { db } from "./db";

const TENANT_TABLES = [
  "services",
  "quotes",
  "quote_items",
  "invoices",
  "invoice_items",
  "reservations",
  "reservation_services",
  "notifications",
  "quote_media",
  "invoice_media",
  "invoice_counters",
  "delivery_notes",
  "delivery_note_invoices",
  "delivery_note_counters",
  "reviews",
  "engagements",
  "workflows",
  "workflow_steps",
  "service_workflows",
  "workshop_tasks",
  "repair_orders",
  "audit_logs",
  "audit_log_changes",
  "chat_conversations",
  "chat_participants",
  "chat_messages",
  "chat_attachments",
  "expense_categories",
  "expenses",
  "credit_notes",
  "credit_note_items",
  "accounting_entries",
  "accounting_lines",
  "fec_exports",
  "credit_note_counters",
  "expense_counters",
  "notification_rules",
];

const SHARED_TABLES = [
  "sessions",
  "garages",
  "users",
  "password_reset_tokens",
  "application_settings",
];

export function getSchemaName(garageSlug: string): string {
  return `garage_${garageSlug.replace(/-/g, "_")}`;
}

export async function createTenantSchema(garageSlug: string): Promise<void> {
  const schemaName = getSchemaName(garageSlug);
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    for (const table of TENANT_TABLES) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schemaName, table]
      );
      if (exists.rows.length === 0) {
        const publicExists = await client.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
          [table]
        );
        if (publicExists.rows.length > 0) {
          await client.query(
            `CREATE TABLE "${schemaName}"."${table}" (LIKE public."${table}" INCLUDING ALL)`
          );
          await createSequencesForTable(client, schemaName, table);
        }
      }
    }

    console.log(`[Tenant] Schema "${schemaName}" created with ${TENANT_TABLES.length} tables`);
  } finally {
    client.release();
  }
}

async function createSequencesForTable(client: any, schemaName: string, table: string): Promise<void> {
  const cols = await client.query(
    `SELECT column_name, column_default FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = $1 
     AND column_default LIKE '%gen_random_uuid%'`,
    [table]
  );
  for (const col of cols.rows) {
    await client.query(
      `ALTER TABLE "${schemaName}"."${table}" ALTER COLUMN "${col.column_name}" SET DEFAULT gen_random_uuid()`
    );
  }
}

export async function migrateDataToTenantSchema(
  garageId: string, 
  garageSlug: string
): Promise<{ table: string; count: number }[]> {
  const schemaName = getSchemaName(garageSlug);
  const client = await pool.connect();
  const results: { table: string; count: number }[] = [];

  try {
    await client.query("BEGIN");

    const tablesWithGarageId = [
      "services", "quotes", "invoices", "reservations", "reviews",
      "delivery_notes", "repair_orders",
    ];

    for (const table of tablesWithGarageId) {
      const colCheck = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'garage_id'`,
        [table]
      );
      if (colCheck.rows.length === 0) continue;

      const existingCheck = await client.query(
        `SELECT COUNT(*) as cnt FROM "${schemaName}"."${table}"`
      );
      if (parseInt(existingCheck.rows[0].cnt) > 0) {
        results.push({ table, count: 0 });
        continue;
      }

      const cols = await client.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = $1 
         ORDER BY ordinal_position`,
        [table]
      );
      const colNames = cols.rows.map((c: any) => `"${c.column_name}"`).join(", ");

      const result = await client.query(
        `INSERT INTO "${schemaName}"."${table}" (${colNames})
         SELECT ${colNames} FROM public."${table}" WHERE garage_id = $1`,
        [garageId]
      );
      results.push({ table, count: result.rowCount || 0 });
    }

    const childTables: { table: string; parentTable: string; fkColumn: string }[] = [
      { table: "quote_items", parentTable: "quotes", fkColumn: "quote_id" },
      { table: "quote_media", parentTable: "quotes", fkColumn: "quote_id" },
      { table: "invoice_items", parentTable: "invoices", fkColumn: "invoice_id" },
      { table: "invoice_media", parentTable: "invoices", fkColumn: "invoice_id" },
      { table: "reservation_services", parentTable: "reservations", fkColumn: "reservation_id" },
      { table: "delivery_note_invoices", parentTable: "delivery_notes", fkColumn: "delivery_note_id" },
      { table: "workshop_tasks", parentTable: "reservations", fkColumn: "reservation_id" },
    ];

    for (const { table, parentTable, fkColumn } of childTables) {
      const tableExists = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schemaName, table]
      );
      if (tableExists.rows.length === 0) continue;

      const existingCheck = await client.query(
        `SELECT COUNT(*) as cnt FROM "${schemaName}"."${table}"`
      );
      if (parseInt(existingCheck.rows[0].cnt) > 0) {
        results.push({ table, count: 0 });
        continue;
      }

      const cols = await client.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = $1 
         ORDER BY ordinal_position`,
        [table]
      );
      const colNames = cols.rows.map((c: any) => `"${c.column_name}"`).join(", ");

      const result = await client.query(
        `INSERT INTO "${schemaName}"."${table}" (${colNames})
         SELECT t.${colNames.split(", ").map(c => `t.${c}`).join(", ")} 
         FROM public."${table}" t
         INNER JOIN "${schemaName}"."${parentTable}" p ON t."${fkColumn}" = p.id`
      );
      results.push({ table, count: result.rowCount || 0 });
    }

    const notifResult = await client.query(
      `INSERT INTO "${schemaName}"."notifications" 
       SELECT n.* FROM public."notifications" n
       INNER JOIN public."users" u ON n.user_id = u.id
       WHERE u.garage_id = $1
       AND NOT EXISTS (SELECT 1 FROM "${schemaName}"."notifications" WHERE id = n.id)`,
      [garageId]
    );
    results.push({ table: "notifications", count: notifResult.rowCount || 0 });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return results;
}

export async function withTenantSchema<T>(
  garageSlug: string,
  fn: (client: any) => Promise<T>
): Promise<T> {
  const schemaName = getSchemaName(garageSlug);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function runInTenantContext<T>(
  garageSlug: string,
  queryFn: (searchPath: string) => Promise<T>
): Promise<T> {
  const schemaName = getSchemaName(garageSlug);
  return queryFn(schemaName);
}

export async function setRequestTenantSchema(garageSlug: string): Promise<void> {
  const schemaName = getSchemaName(garageSlug);
  await db.execute(sql.raw(`SET search_path TO "${schemaName}", public`));
}

export async function resetSearchPath(): Promise<void> {
  await db.execute(sql.raw(`SET search_path TO public`));
}

export { TENANT_TABLES, SHARED_TABLES };
