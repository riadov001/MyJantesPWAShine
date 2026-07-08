#!/usr/bin/env node
// Import missing records from JSON export into dev DB
// Deduplication strategy:
//   - users:        ON CONFLICT (email) DO NOTHING (email is the business key)
//   - quotes:       ON CONFLICT (id) DO NOTHING + skip if reference already exists
//   - quote_items:  ON CONFLICT (id) DO NOTHING
//   - invoices:     ON CONFLICT (id) DO NOTHING + skip if invoice_number already exists
//   - invoice_items: ON CONFLICT (id) DO NOTHING
// Test accounts are filtered at all levels (users + their child records)

const fs = require('fs');
const { Client } = require('pg');

const DB_URL = process.env.DEV_DATABASE_URL;
if (!DB_URL) {
  console.error('DEV_DATABASE_URL not set');
  process.exit(1);
}

// Test emails whose data must never be re-imported
const TEST_EMAILS = new Set([
  'sasmyjantes@gmail.com',
  'mytoolsgroup26@gmail.com',
  'appmytools@gmail.com',
  'appmyjantes0@gmail.com',
  'admin@myjantes.fr',
  'mytoolsgroup@gmail.com',
  'mytoolsapp@gmail.com',
  'saasmyjantes@gmail.com',
]);

// Counters for reconciliation report
const stats = {
  users:        { attempted: 0, inserted: 0, skipped: 0, failed: 0, failedItems: [] },
  quotes:       { attempted: 0, inserted: 0, skipped: 0, failed: 0, failedItems: [] },
  quoteItems:   { attempted: 0, inserted: 0, skipped: 0, failed: 0, failedItems: [] },
  invoices:     { attempted: 0, inserted: 0, skipped: 0, failed: 0, failedItems: [] },
  invoiceItems: { attempted: 0, inserted: 0, skipped: 0, failed: 0, failedItems: [] },
};

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // Load JSON export
  const raw = JSON.parse(fs.readFileSync(
    'attached_assets/myjantes-data-2026-05-12_2_1778563182835.json', 'utf8'
  ));
  const d = raw.data;

  // Fetch existing business keys from DB
  const { rows: existingEmails }  = await client.query('SELECT email FROM users');
  const { rows: existingRefs }    = await client.query('SELECT reference FROM quotes WHERE reference IS NOT NULL');
  const { rows: existingInvNums } = await client.query('SELECT invoice_number FROM invoices');
  const { rows: existingQIIds }   = await client.query('SELECT id FROM quote_items');
  const { rows: existingIIIds }   = await client.query('SELECT id FROM invoice_items');

  const dbEmails  = new Set(existingEmails.map(r => r.email));
  const dbRefs    = new Set(existingRefs.map(r => r.reference));
  const dbInvNums = new Set(existingInvNums.map(r => r.invoice_number));
  const dbQIIds   = new Set(existingQIIds.map(r => r.id));
  const dbIIIds   = new Set(existingIIIds.map(r => r.id));

  // Build set of test user IDs from JSON (to filter child records)
  const testUserIds = new Set(
    d.users.filter(u => TEST_EMAILS.has(u.email)).map(u => u.id)
  );

  // ── USERS ─────────────────────────────────────────────────────────
  console.log('\n=== Importing users ===');
  for (const u of d.users) {
    if (TEST_EMAILS.has(u.email)) continue;

    stats.users.attempted++;
    if (dbEmails.has(u.email)) {
      stats.users.skipped++;
      continue;
    }

    try {
      const res = await client.query(`
        INSERT INTO users (
          id, email, password, first_name, last_name, phone, address,
          postal_code, city, profile_image_url, role, garage_id,
          company_name, siret, tva_number, company_address,
          company_postal_code, company_city, company_country,
          sms_consent, marketing_email_consent, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        ON CONFLICT (email) DO NOTHING
      `, [
        u.id,
        u.email,
        u.password || null,
        u.firstName || u.first_name || null,
        u.lastName  || u.last_name  || null,
        u.phone     || null,
        u.address   || null,
        u.postalCode || u.postal_code || null,
        u.city       || null,
        u.profileImageUrl || u.profile_image_url || null,
        u.role       || 'client',
        u.garageId   || u.garage_id  || null,
        u.companyName       || u.company_name        || null,
        u.siret             || null,
        u.tvaNumber         || u.tva_number          || null,
        u.companyAddress    || u.company_address     || null,
        u.companyPostalCode || u.company_postal_code || null,
        u.companyCity       || u.company_city        || null,
        u.companyCountry    || u.company_country     || 'FR',
        u.smsConsent            || u.sms_consent             || false,
        u.marketingEmailConsent || u.marketing_email_consent || false,
        u.createdAt || u.created_at || new Date(),
        u.updatedAt || u.updated_at || new Date(),
      ]);
      if (res.rowCount > 0) {
        stats.users.inserted++;
        dbEmails.add(u.email);
      } else {
        stats.users.skipped++;
      }
    } catch (e) {
      stats.users.failed++;
      stats.users.failedItems.push({ key: u.email, error: e.message });
    }
  }

  // Refresh user ID set after inserts
  const { rows: allUsers } = await client.query('SELECT id FROM users');
  const dbUserIds = new Set(allUsers.map(r => r.id));

  // ── QUOTES ────────────────────────────────────────────────────────
  console.log('\n=== Importing quotes ===');
  const skippedQuoteIds = new Set();

  for (const q of d.quotes) {
    const clientId = q.clientId || q.client_id;
    const ref      = q.reference || null;

    if (testUserIds.has(clientId)) {
      skippedQuoteIds.add(q.id);
      continue;
    }

    stats.quotes.attempted++;

    // Skip by business key (reference)
    if (ref && dbRefs.has(ref)) {
      stats.quotes.skipped++;
      continue;
    }

    // Verify clientId exists in DB
    if (!dbUserIds.has(clientId)) {
      stats.quotes.failed++;
      stats.quotes.failedItems.push({ key: ref || q.id, error: `client_id ${clientId} not in DB` });
      skippedQuoteIds.add(q.id);
      continue;
    }

    try {
      const res = await client.query(`
        INSERT INTO quotes (
          id, garage_id, reference, client_id, service_id, vehicle_id,
          status, payment_method, request_details, quote_amount,
          wheel_count, diameter, wheel_positions,
          price_excluding_tax, tax_rate, tax_amount,
          product_details, notes, valid_until, view_token,
          email_sent_at, viewed_at,
          vehicle_registration, vehicle_make, vehicle_model, vehicle_vin,
          vehicle_fuel_type, vehicle_fiscal_power, vehicle_first_reg_date, vehicle_color,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
          $31,$32
        )
        ON CONFLICT (id) DO NOTHING
      `, [
        q.id,
        q.garageId  || q.garage_id  || null,
        ref,
        clientId,
        q.serviceId || q.service_id,
        q.vehicleId || q.vehicle_id || null,
        q.status    || 'pending',
        q.paymentMethod || q.payment_method || 'wire_transfer',
        q.requestDetails || q.request_details
          ? JSON.stringify(q.requestDetails || q.request_details) : null,
        q.quoteAmount || q.quote_amount || null,
        q.wheelCount  || q.wheel_count  || null,
        q.diameter    || null,
        q.wheelPositions || q.wheel_positions
          ? JSON.stringify(q.wheelPositions || q.wheel_positions) : null,
        q.priceExcludingTax || q.price_excluding_tax || null,
        q.taxRate   || q.tax_rate   || null,
        q.taxAmount || q.tax_amount || null,
        q.productDetails || q.product_details || null,
        q.notes     || null,
        q.validUntil || q.valid_until || null,
        q.viewToken  || q.view_token  || null,
        q.emailSentAt || q.email_sent_at || null,
        q.viewedAt    || q.viewed_at    || null,
        q.vehicleRegistration || q.vehicle_registration || null,
        q.vehicleMake  || q.vehicle_make  || null,
        q.vehicleModel || q.vehicle_model || null,
        q.vehicleVin   || q.vehicle_vin   || null,
        q.vehicleFuelType     || q.vehicle_fuel_type     || null,
        q.vehicleFiscalPower  || q.vehicle_fiscal_power  || null,
        q.vehicleFirstRegDate || q.vehicle_first_reg_date|| null,
        q.vehicleColor || q.vehicle_color || null,
        q.createdAt || q.created_at || new Date(),
        q.updatedAt || q.updated_at || new Date(),
      ]);
      if (res.rowCount > 0) {
        stats.quotes.inserted++;
        if (ref) dbRefs.add(ref);
      } else {
        stats.quotes.skipped++;
        skippedQuoteIds.add(q.id);
      }
    } catch (e) {
      stats.quotes.failed++;
      stats.quotes.failedItems.push({ key: ref || q.id, error: e.message });
      skippedQuoteIds.add(q.id);
    }
  }

  // ── QUOTE ITEMS ───────────────────────────────────────────────────
  console.log('\n=== Importing quote items ===');
  for (const qi of d.quoteItems) {
    const quoteId = qi.quoteId || qi.quote_id;
    if (skippedQuoteIds.has(quoteId)) continue;

    stats.quoteItems.attempted++;
    if (dbQIIds.has(qi.id)) { stats.quoteItems.skipped++; continue; }

    try {
      const res = await client.query(`
        INSERT INTO quote_items (
          id, quote_id, description, quantity,
          unit_price_excluding_tax, total_excluding_tax,
          tax_rate, tax_amount, total_including_tax,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO NOTHING
      `, [
        qi.id, quoteId,
        qi.description,
        qi.quantity || '1',
        qi.unitPriceExcludingTax || qi.unit_price_excluding_tax,
        qi.totalExcludingTax     || qi.total_excluding_tax,
        qi.taxRate   || qi.tax_rate,
        qi.taxAmount || qi.tax_amount,
        qi.totalIncludingTax || qi.total_including_tax,
        qi.createdAt || qi.created_at || new Date(),
        qi.updatedAt || qi.updated_at || new Date(),
      ]);
      if (res.rowCount > 0) { stats.quoteItems.inserted++; dbQIIds.add(qi.id); }
      else stats.quoteItems.skipped++;
    } catch (e) {
      stats.quoteItems.failed++;
      stats.quoteItems.failedItems.push({ key: qi.id, error: e.message });
    }
  }

  // ── INVOICES ──────────────────────────────────────────────────────
  console.log('\n=== Importing invoices ===');
  const skippedInvoiceIds = new Set();

  for (const inv of d.invoices) {
    const invNum   = inv.invoiceNumber || inv.invoice_number;
    const clientId = inv.clientId || inv.client_id || null;

    if (clientId && testUserIds.has(clientId)) {
      skippedInvoiceIds.add(inv.id);
      continue;
    }

    stats.invoices.attempted++;

    // Skip by business key (invoice_number)
    if (dbInvNums.has(invNum)) {
      stats.invoices.skipped++;
      continue;
    }

    // Verify clientId exists if set
    if (clientId && !dbUserIds.has(clientId)) {
      stats.invoices.failed++;
      stats.invoices.failedItems.push({ key: invNum, error: `client_id ${clientId} not in DB` });
      skippedInvoiceIds.add(inv.id);
      continue;
    }

    try {
      const res = await client.query(`
        INSERT INTO invoices (
          id, garage_id, quote_id, client_id, invoice_number, amount,
          payment_method, wheel_count, diameter,
          price_excluding_tax, tax_rate, tax_amount,
          product_details, status, customer_name, customer_email,
          customer_address, customer_phone,
          stripe_session_id, stripe_payment_intent_id, payment_link,
          due_date, paid_at, view_token, email_sent_at, viewed_at, notes,
          vehicle_registration, vehicle_make, vehicle_model, vehicle_vin,
          vehicle_fuel_type, vehicle_fiscal_power, vehicle_first_reg_date, vehicle_color,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
          $31,$32,$33,$34,$35,$36,$37
        )
        ON CONFLICT (id) DO NOTHING
      `, [
        inv.id,
        inv.garageId || inv.garage_id || null,
        inv.quoteId  || inv.quote_id  || null,
        clientId,
        invNum,
        inv.amount || '0',
        inv.paymentMethod || inv.payment_method || null,
        inv.wheelCount || inv.wheel_count || null,
        inv.diameter   || null,
        inv.priceExcludingTax || inv.price_excluding_tax || null,
        inv.taxRate   || inv.tax_rate   || null,
        inv.taxAmount || inv.tax_amount || null,
        inv.productDetails || inv.product_details || null,
        inv.status     || 'draft',
        inv.customerName  || inv.customer_name  || null,
        inv.customerEmail || inv.customer_email || null,
        inv.customerAddress || inv.customer_address || null,
        inv.customerPhone   || inv.customer_phone   || null,
        inv.stripeSessionId       || inv.stripe_session_id        || null,
        inv.stripePaymentIntentId || inv.stripe_payment_intent_id || null,
        inv.paymentLink || inv.payment_link || null,
        inv.dueDate  || inv.due_date  || null,
        inv.paidAt   || inv.paid_at   || null,
        inv.viewToken|| inv.view_token|| null,
        inv.emailSentAt || inv.email_sent_at || null,
        inv.viewedAt    || inv.viewed_at    || null,
        inv.notes || null,
        inv.vehicleRegistration || inv.vehicle_registration || null,
        inv.vehicleMake  || inv.vehicle_make  || null,
        inv.vehicleModel || inv.vehicle_model || null,
        inv.vehicleVin   || inv.vehicle_vin   || null,
        inv.vehicleFuelType     || inv.vehicle_fuel_type     || null,
        inv.vehicleFiscalPower  || inv.vehicle_fiscal_power  || null,
        inv.vehicleFirstRegDate || inv.vehicle_first_reg_date|| null,
        inv.vehicleColor || inv.vehicle_color || null,
        inv.createdAt || inv.created_at || new Date(),
        inv.updatedAt || inv.updated_at || new Date(),
      ]);
      if (res.rowCount > 0) {
        stats.invoices.inserted++;
        dbInvNums.add(invNum);
      } else {
        stats.invoices.skipped++;
        skippedInvoiceIds.add(inv.id);
      }
    } catch (e) {
      stats.invoices.failed++;
      stats.invoices.failedItems.push({ key: invNum || inv.id, error: e.message });
      skippedInvoiceIds.add(inv.id);
    }
  }

  // ── INVOICE ITEMS ─────────────────────────────────────────────────
  console.log('\n=== Importing invoice items ===');
  for (const ii of d.invoiceItems) {
    const invoiceId = ii.invoiceId || ii.invoice_id;
    if (skippedInvoiceIds.has(invoiceId)) continue;

    stats.invoiceItems.attempted++;
    if (dbIIIds.has(ii.id)) { stats.invoiceItems.skipped++; continue; }

    try {
      const res = await client.query(`
        INSERT INTO invoice_items (
          id, invoice_id, description, quantity,
          unit_price_excluding_tax, total_excluding_tax,
          tax_rate, tax_amount, total_including_tax,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO NOTHING
      `, [
        ii.id, invoiceId,
        ii.description,
        ii.quantity || '1',
        ii.unitPriceExcludingTax || ii.unit_price_excluding_tax,
        ii.totalExcludingTax     || ii.total_excluding_tax,
        ii.taxRate   || ii.tax_rate,
        ii.taxAmount || ii.tax_amount,
        ii.totalIncludingTax || ii.total_including_tax,
        ii.createdAt || ii.created_at || new Date(),
        ii.updatedAt || ii.updated_at || new Date(),
      ]);
      if (res.rowCount > 0) { stats.invoiceItems.inserted++; dbIIIds.add(ii.id); }
      else stats.invoiceItems.skipped++;
    } catch (e) {
      stats.invoiceItems.failed++;
      stats.invoiceItems.failedItems.push({ key: ii.id, error: e.message });
    }
  }

  // ── RECONCILIATION REPORT ─────────────────────────────────────────
  const { rows: dbCounts } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM users)         AS users,
      (SELECT COUNT(*) FROM quotes)        AS quotes,
      (SELECT COUNT(*) FROM quote_items)   AS quote_items,
      (SELECT COUNT(*) FROM invoices)      AS invoices,
      (SELECT COUNT(*) FROM invoice_items) AS invoice_items
  `);
  const db = dbCounts[0];

  // Expected from JSON (real data only, test accounts excluded)
  const jsonUsers  = d.users.filter(u => !TEST_EMAILS.has(u.email)).length;
  const jsonQuotes = d.quotes.filter(q => !testUserIds.has(q.clientId || q.client_id)).length;
  const validQIds  = new Set(d.quotes.filter(q => !testUserIds.has(q.clientId || q.client_id)).map(q => q.id));
  const jsonQItems = d.quoteItems.filter(qi => validQIds.has(qi.quoteId || qi.quote_id)).length;
  const jsonInvoices = d.invoices.filter(i => !testUserIds.has(i.clientId || i.client_id)).length;
  const validIIds    = new Set(d.invoices.filter(i => !testUserIds.has(i.clientId || i.client_id)).map(i => i.id));
  const jsonIItems   = d.invoiceItems.filter(ii => validIIds.has(ii.invoiceId || ii.invoice_id)).length;

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                     RECONCILIATION REPORT                           ║');
  console.log('╠══════════════════╦══════════════╦══════════════╦════════════════════╣');
  console.log('║ Table            ║ JSON (réel)  ║ DB finale    ║ Delta              ║');
  console.log('╠══════════════════╬══════════════╬══════════════╬════════════════════╣');

  const tableRows = [
    ['users',         jsonUsers,   parseInt(db.users)],
    ['quotes',        jsonQuotes,  parseInt(db.quotes)],
    ['quote_items',   jsonQItems,  parseInt(db.quote_items)],
    ['invoices',      jsonInvoices,parseInt(db.invoices)],
    ['invoice_items', jsonIItems,  parseInt(db.invoice_items)],
  ];
  for (const [name, expected, actual] of tableRows) {
    const delta = actual - expected;
    const flag  = Math.abs(delta) > 2 ? ' ⚠' : ' ✓';
    console.log(
      `║ ${name.padEnd(16)} ║ ${String(expected).padEnd(12)} ║ ${String(actual).padEnd(12)} ║ ${(delta >= 0 ? '+'+delta : String(delta)).padEnd(16)}${flag}  ║`
    );
  }
  console.log('╠══════════════════╩══════════════╩══════════════╩════════════════════╣');
  console.log('║ Détail par table:                                                    ║');
  for (const [key, s] of Object.entries(stats)) {
    console.log(`║   ${key.padEnd(14)}: tenté=${String(s.attempted).padEnd(4)} inséré=${String(s.inserted).padEnd(4)} ignoré=${String(s.skipped).padEnd(4)} échec=${s.failed}  ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // Detail failures
  let hasFailures = false;
  for (const [key, s] of Object.entries(stats)) {
    if (s.failedItems.length > 0) {
      hasFailures = true;
      console.log(`\nÉchecs ${key}:`);
      s.failedItems.forEach(f => console.log(`  [${f.key}] ${f.error}`));
    }
  }
  if (!hasFailures) console.log('\nAucun échec critique.');

  // Exit non-zero if any table failure rate > 5%
  const criticalTables = Object.entries(stats)
    .filter(([, s]) => s.attempted > 0 && s.failed / s.attempted > 0.05);
  if (criticalTables.length > 0) {
    console.error('\nERREUR : taux d\'échec > 5% sur:', criticalTables.map(([k]) => k).join(', '));
    await client.end();
    process.exit(1);
  }

  await client.end();
  console.log('\nTerminé !');
}

main().catch(e => { console.error(e); process.exit(1); });
