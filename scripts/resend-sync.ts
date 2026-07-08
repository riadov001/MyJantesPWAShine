/**
 * RESEND → PostgreSQL ONE-SHOT SYNC
 * Synchronise les emails Resend avec la base PostgreSQL MyJantes.
 * Lance une seule fois, ne modifie pas le schéma, pas de doublons.
 */

import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;
const LOG_FILE = path.join(process.cwd(), "scripts", "resend-sync.log");
const GARAGE_ID = "0dbd555d-cc2b-48d7-8304-5f5beb5c915e"; // MyJantes garage

// ─── LOGGING ─────────────────────────────────────────────────────────────────
const logLines: string[] = [];
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logLines.push(line);
}
function flushLog() {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.writeFileSync(LOG_FILE, logLines.join("\n") + "\n");
}

// ─── TEST / INTERNAL EXCLUSION LISTS ─────────────────────────────────────────
const EXCLUDED_EMAILS_EXACT = new Set([
  "rbelmahi90@gmail.com",
  "appmyjantes0@gmail.com",
  "appmytools@gmail.com",
  "myjantes250@gmail.com",
  "test@example.com",
  "alvinmaurice00@gmail.com",
  "admin@test.com",
  "myjantesmobile@gmail.com",
  "myjantesappv@gmail.com",
  "myjanteszppv@gmail.com",
  "supadmin@myjantes.fr",
  "naim.bela59@gmail.com",
  "g.varlet@myjantes.com",
  "rootadmin@myjantes.com",
  "contact@myjantes.com",
  "fg@gh.ft",
  "rootadmin@mytools.com",
  "testcheck@mytools.com",
  "mytoolsgroup@gmail.com",
  "reviewer@apple.com",
  "appmyjantes@gmail.com",
  "nicolas.test@gmail.com",
]);

const EXCLUDED_EMAIL_PATTERNS = [
  /@mytools\.com$/i,
  /^test[_@]/i,
  /^admin@test\./i,
  /myjantesappv/i,
  /myjantesmobile/i,
  /myjanteszppv/i,
  /mytoolsgroup/i,
  /rootadmin/i,
  /appmyjantes/i,
  /supadmin@myjantes/i,
  /@newgarage\.com$/i,
  /@test\.com$/i,
];

const EXCLUDED_SUBJECTS = [
  /rapport quotidien/i,
  /réinitialisation/i,
  /vérifiez votre adresse/i,
  /alerte stockage/i,
  /analyse commerciale/i,
  /analyse globale/i,
  /nouveau garage/i,
  /bienvenue chez/i,
  /test email/i,
  /client a accepte/i,
  /programmez votre rendez-vous/i,
  /votre compte client/i,
  /code de réinitialisation/i,
  /configuration vérifiée/i,
  /mot de passe/i,
];

// Only accept emails FROM MyJantes (not MyTools)
const VALID_SENDERS = [
  /myjantes/i,
];

// ─── RELEVANT SUBJECT PATTERNS ────────────────────────────────────────────────
// Matches subjects we care about
const SUBJECT_INVOICE = /votre facture\s+([\w-]+)\s*-\s*myjantes/i;
const SUBJECT_PAYMENT = /confirmation de paiement\s*-\s*facture\s+([\w-]+)/i;
const SUBJECT_QUOTE_SENT = /votre devis\s+([\w-]+)\s*-\s*myjantes/i;
const SUBJECT_QUOTE_EMAIL = /devis\s+n[°o]?([\w-]+)\s*-\s*my\s*jantes\s*-\s*([\d\s,.]+)\s*€/i;
const SUBJECT_RESERVATION = /\[myjantes\]\s+votre réservation du\s+(.+)/i;

// ─── RESEND API ───────────────────────────────────────────────────────────────
interface ResendEmail {
  id: string;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  last_event: string;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Only process recent emails - the DB already has the full export up to April 10.
// We focus on April 2026 gap + the most recent 1500 emails to catch payment confirmations.
const DATE_CUTOFF = new Date("2026-03-01T00:00:00Z");
const MAX_PAGES = 15; // 1500 emails max to avoid timeout

async function fetchAllEmails(): Promise<ResendEmail[]> {
  const all: ResendEmail[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  let page = 1;

  while (hasMore) {
    log(`Fetching page ${page} (offset=${offset})...`);
    let resp: Response | null = null;
    let retries = 3;
    while (retries > 0) {
      resp = await fetch(
        `https://api.resend.com/emails?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } }
      );
      if (resp.status === 429) {
        log(`  Rate limited, waiting 2s...`);
        await sleep(2000);
        retries--;
        continue;
      }
      break;
    }
    if (!resp || !resp.ok) {
      log(`ERROR fetching emails: ${resp?.status} ${await resp?.text()}`);
      break;
    }
    const data: any = await resp.json();
    const emails: ResendEmail[] = data.data || [];

    // Stop if oldest email in this batch is before cutoff
    // Resend returns newest first
    const oldest = emails[emails.length - 1];
    if (oldest && new Date(oldest.created_at) < DATE_CUTOFF) {
      // Only keep emails after cutoff
      const filtered = emails.filter(e => new Date(e.created_at) >= DATE_CUTOFF);
      all.push(...filtered);
      log(`  Reached date cutoff (${DATE_CUTOFF.toISOString().substring(0,10)}), stopping.`);
      break;
    }

    all.push(...emails);
    hasMore = data.has_more === true;
    offset += limit;
    page++;
    if (!hasMore || emails.length === 0) break;
    if (page > MAX_PAGES) {
      log(`  Reached max pages (${MAX_PAGES}), stopping.`);
      break;
    }
    await sleep(250); // stay under 5 req/s
  }

  log(`Total emails fetched from Resend: ${all.length}`);
  return all;
}

// ─── FILTERING ────────────────────────────────────────────────────────────────
function isTestEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (EXCLUDED_EMAILS_EXACT.has(lower)) return true;
  return EXCLUDED_EMAIL_PATTERNS.some((p) => p.test(lower));
}

function isValidSender(from: string): boolean {
  return VALID_SENDERS.some((p) => p.test(from));
}

function isExcludedSubject(subject: string): boolean {
  return EXCLUDED_SUBJECTS.some((p) => p.test(subject));
}

function isRelevantEmail(email: ResendEmail): boolean {
  const to = email.to?.[0] || "";
  if (isTestEmail(to)) return false;
  if (!isValidSender(email.from)) return false;
  if (isExcludedSubject(email.subject)) return false;

  // Must match at least one relevant subject pattern
  const subj = email.subject;
  return (
    SUBJECT_INVOICE.test(subj) ||
    SUBJECT_PAYMENT.test(subj) ||
    SUBJECT_QUOTE_SENT.test(subj) ||
    SUBJECT_QUOTE_EMAIL.test(subj) ||
    SUBJECT_RESERVATION.test(subj)
  );
}

// ─── DATA EXTRACTION ──────────────────────────────────────────────────────────
interface ExtractedData {
  type: "invoice" | "payment" | "quote_sent" | "quote_email" | "reservation";
  reference?: string;
  clientEmail: string;
  amount?: number;
  date: Date;
}

function extractData(email: ResendEmail): ExtractedData | null {
  const subj = email.subject;
  const clientEmail = (email.to?.[0] || "").toLowerCase().trim();
  const date = new Date(email.created_at);

  let m: RegExpMatchArray | null;

  m = subj.match(SUBJECT_INVOICE);
  if (m) {
    return { type: "invoice", reference: m[1], clientEmail, date };
  }

  m = subj.match(SUBJECT_PAYMENT);
  if (m) {
    return { type: "payment", reference: m[1], clientEmail, date };
  }

  m = subj.match(SUBJECT_QUOTE_EMAIL);
  if (m) {
    const rawAmount = m[2].replace(/\s/g, "").replace(",", ".");
    return {
      type: "quote_email",
      reference: m[1],
      clientEmail,
      amount: parseFloat(rawAmount) || undefined,
      date,
    };
  }

  m = subj.match(SUBJECT_QUOTE_SENT);
  if (m) {
    return { type: "quote_sent", reference: m[1], clientEmail, date };
  }

  m = subj.match(SUBJECT_RESERVATION);
  if (m) {
    return { type: "reservation", clientEmail, date };
  }

  return null;
}

// ─── DB HELPERS ───────────────────────────────────────────────────────────────
async function ensureUser(
  pool: Pool,
  email: string
): Promise<string | null> {
  if (!email || isTestEmail(email)) return null;

  // Check if user exists (case-insensitive)
  const res = await pool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  if (res.rows.length > 0) return res.rows[0].id;

  // Create minimal user
  const ins = await pool.query(
    `INSERT INTO users (email, role, garage_id, sms_consent)
     VALUES ($1, 'client', $2, false)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [email, GARAGE_ID]
  );
  if (ins.rows.length > 0) {
    log(`  ✓ Nouvel utilisateur créé: ${email}`);
    return ins.rows[0].id;
  }

  // Retry after possible conflict
  const retry = await pool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  return retry.rows[0]?.id || null;
}

async function handleInvoice(
  pool: Pool,
  data: ExtractedData
): Promise<void> {
  if (!data.reference) return;

  const userId = await ensureUser(pool, data.clientEmail);

  // Find invoice by number
  const inv = await pool.query(
    `SELECT id, customer_email, client_id, status FROM invoices
     WHERE invoice_number = $1 LIMIT 1`,
    [data.reference]
  );

  if (inv.rows.length === 0) {
    log(`  ⚠ Facture introuvable en BDD: ${data.reference}`);
    return;
  }

  const row = inv.rows[0];
  const updates: string[] = [];
  const params: any[] = [];
  let pi = 1;

  if (!row.customer_email && data.clientEmail) {
    updates.push(`customer_email = $${pi++}`);
    params.push(data.clientEmail);
  }
  if (!row.client_id && userId) {
    updates.push(`client_id = $${pi++}`);
    params.push(userId);
  }

  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`);
    params.push(row.id);
    await pool.query(
      `UPDATE invoices SET ${updates.join(", ")} WHERE id = $${pi}`,
      params
    );
    log(`  ✓ Facture ${data.reference} mise à jour: ${updates.join(", ")}`);
  } else {
    log(`  — Facture ${data.reference}: aucune mise à jour nécessaire`);
  }
}

async function handlePayment(
  pool: Pool,
  data: ExtractedData
): Promise<void> {
  if (!data.reference) return;

  const userId = await ensureUser(pool, data.clientEmail);

  const inv = await pool.query(
    `SELECT id, customer_email, client_id, status, paid_at FROM invoices
     WHERE invoice_number = $1 LIMIT 1`,
    [data.reference]
  );

  if (inv.rows.length === 0) {
    log(`  ⚠ Facture paiement introuvable: ${data.reference}`);
    return;
  }

  const row = inv.rows[0];
  const updates: string[] = [];
  const params: any[] = [];
  let pi = 1;

  if (row.status !== "paid") {
    updates.push(`status = $${pi++}`);
    params.push("paid");
    if (!row.paid_at) {
      updates.push(`paid_at = $${pi++}`);
      params.push(data.date.toISOString());
    }
  }
  if (!row.customer_email && data.clientEmail) {
    updates.push(`customer_email = $${pi++}`);
    params.push(data.clientEmail);
  }
  if (!row.client_id && userId) {
    updates.push(`client_id = $${pi++}`);
    params.push(userId);
  }

  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`);
    params.push(row.id);
    await pool.query(
      `UPDATE invoices SET ${updates.join(", ")} WHERE id = $${pi}`,
      params
    );
    log(`  ✓ Facture ${data.reference} paiement confirmé + ${updates.join(", ")}`);
  } else {
    log(`  — Facture ${data.reference} paiement: déjà à jour`);
  }
}

async function handleQuote(
  pool: Pool,
  data: ExtractedData
): Promise<void> {
  if (!data.reference) return;

  const userId = await ensureUser(pool, data.clientEmail);

  const q = await pool.query(
    `SELECT id, client_id, quote_amount, status FROM quotes
     WHERE reference = $1 LIMIT 1`,
    [data.reference]
  );

  if (q.rows.length === 0) {
    log(`  ⚠ Devis introuvable: ${data.reference}`);
    return;
  }

  const row = q.rows[0];
  const updates: string[] = [];
  const params: any[] = [];
  let pi = 1;

  if (!row.client_id && userId) {
    updates.push(`client_id = $${pi++}`);
    params.push(userId);
  }
  if (data.amount && !row.quote_amount) {
    updates.push(`quote_amount = $${pi++}`);
    params.push(data.amount);
  }

  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`);
    params.push(row.id);
    await pool.query(
      `UPDATE quotes SET ${updates.join(", ")} WHERE id = $${pi}`,
      params
    );
    log(`  ✓ Devis ${data.reference} mis à jour: ${updates.join(", ")}`);
  } else {
    log(`  — Devis ${data.reference}: déjà à jour`);
  }
}

async function fixInvoicesFromUsers(pool: Pool): Promise<void> {
  log("\n── Correction rapide: remplissage customer_email depuis users ──");
  const res = await pool.query(`
    UPDATE invoices i
    SET customer_email = u.email,
        customer_name = TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))),
        updated_at = NOW()
    FROM users u
    WHERE i.client_id = u.id
      AND (i.customer_email IS NULL OR i.customer_email = '')
      AND LOWER(u.email) NOT IN (
        SELECT LOWER(email) FROM users WHERE role IN ('admin','superadmin')
      )
      AND u.email NOT LIKE '%@myjantes%'
      AND u.email NOT LIKE '%rbelmahi%'
      AND u.email NOT LIKE '%test%'
    RETURNING i.invoice_number, u.email
  `);
  log(`  ✓ ${res.rowCount} facture(s) mises à jour depuis users`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  log("═══════════════════════════════════════════════");
  log(" RESEND → PostgreSQL SYNC — ONE SHOT");
  log("═══════════════════════════════════════════════\n");

  const pool = new Pool({ connectionString: DATABASE_URL });

  // Step 1: quick SQL fix — fill customer_email from users join
  await fixInvoicesFromUsers(pool);

  // Step 2: fetch all emails from Resend
  log("\n── Récupération des emails Resend ──");
  const allEmails = await fetchAllEmails();

  // Step 3: filter
  const relevant = allEmails.filter(isRelevantEmail);
  const excluded = allEmails.length - relevant.length;
  log(`\n── Filtrage: ${relevant.length} pertinents / ${excluded} ignorés ──`);

  // Stats
  const stats = { invoice: 0, payment: 0, quote: 0, reservation: 0, skipped: 0, errors: 0 };

  // Step 4: process each relevant email
  log("\n── Traitement ──");
  for (const email of relevant) {
    const data = extractData(email);
    if (!data) {
      log(`  SKIP (extraction vide): ${email.subject.substring(0, 60)}`);
      stats.skipped++;
      continue;
    }

    log(`\n► [${data.type.toUpperCase()}] ${email.subject.substring(0, 60)}`);
    log(`  To: ${data.clientEmail} | Ref: ${data.reference || "—"}`);

    try {
      switch (data.type) {
        case "invoice":
          await handleInvoice(pool, data);
          stats.invoice++;
          break;
        case "payment":
          await handlePayment(pool, data);
          stats.payment++;
          break;
        case "quote_email":
        case "quote_sent":
          await handleQuote(pool, data);
          stats.quote++;
          break;
        case "reservation":
          await ensureUser(pool, data.clientEmail);
          stats.reservation++;
          break;
      }
    } catch (err: any) {
      log(`  ✗ ERREUR: ${err.message}`);
      stats.errors++;
    }
  }

  // Step 5: fill remaining customer_email on invoices via payment confirmations lookup
  log("\n── Vérification finale des factures encore sans email ──");
  const stillMissing = await pool.query(`
    SELECT COUNT(*) as cnt FROM invoices
    WHERE (customer_email IS NULL OR customer_email = '') AND client_id IS NOT NULL
  `);
  log(`  Factures encore sans email: ${stillMissing.rows[0].cnt}`);

  // Final stats
  log("\n═══════════════════════════════════════════════");
  log(" RÉSUMÉ FINAL");
  log("═══════════════════════════════════════════════");
  log(`  Total emails Resend: ${allEmails.length}`);
  log(`  Emails pertinents:   ${relevant.length}`);
  log(`  Emails ignorés:      ${excluded}`);
  log(`  Factures traitées:   ${stats.invoice}`);
  log(`  Paiements:           ${stats.payment}`);
  log(`  Devis:               ${stats.quote}`);
  log(`  Réservations:        ${stats.reservation}`);
  log(`  Ignorés (extract):   ${stats.skipped}`);
  log(`  Erreurs:             ${stats.errors}`);
  log("═══════════════════════════════════════════════");
  log(`  Log: ${LOG_FILE}`);

  await pool.end();
  flushLog();
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  flushLog();
  process.exit(1);
});
