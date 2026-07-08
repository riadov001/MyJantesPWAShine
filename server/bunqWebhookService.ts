/**
 * bunqWebhookService.ts
 * Service de traitement des e-mails bunq reçus via Resend Inbound.
 * Supporte CSV, PDF (OCR Tesseract.js) et ZIP.
 */

import { parse as csvParse } from "csv-parse/sync";
import path from "path";
import { Readable } from "stream";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedBunqTransaction {
  date: string;          // ISO YYYY-MM-DD
  label: string;
  amount: number;        // négatif = dépense, positif = crédit
  currency: string;
  rawLine: string;       // ligne originale pour audit
}

export interface BunqAttachment {
  filename: string;
  content_type: string;
  data: string;          // base64
}

export interface SyncResult {
  filename: string;
  type: "csv" | "pdf" | "zip" | "unknown";
  transactions: ParsedBunqTransaction[];
  errors: string[];
}

// ─── Validation sécurité ──────────────────────────────────────────────────────

/** Vérifie que l'e-mail vient bien de @bunq.com */
export function isBunqSender(from: string): boolean {
  const normalized = (from || "").toLowerCase().trim();
  // Accepte "Bunq <noreply@bunq.com>" ou "noreply@bunq.com"
  return normalized.includes("@bunq.com");
}

/** Extensions autorisées */
const ALLOWED_EXTENSIONS = new Set([".csv", ".pdf", ".zip"]);

export function isSafeFilename(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  // Bloque les noms avec traversée de chemin ou extensions dangereuses
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  return ALLOWED_EXTENSIONS.has(ext);
}

// ─── Parseur CSV bunq ─────────────────────────────────────────────────────────

/**
 * bunq exporte en CSV avec ces colonnes (format standard bunq export) :
 *   Date, Time, Amount, Currency, Description, Balance After Transaction, ...
 * Ou format alternatif : Date,Amount,Currency,Description,...
 */
export function parseBunqCsv(buffer: Buffer): ParsedBunqTransaction[] {
  const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let records: Record<string, string>[];
  try {
    records = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: ",",
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch {
    // Essaie avec point-virgule (format FR)
    records = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: ";",
      relax_column_count: true,
    }) as Record<string, string>[];
  }

  const txs: ParsedBunqTransaction[] = [];

  for (const row of records) {
    // Normalise les clés (casse insensible)
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) r[k.toLowerCase().trim()] = v;

    // Date : colonnes possibles
    const rawDate = r["date"] || r["datum"] || r["transaction date"] || "";
    const rawAmount = r["amount"] || r["betrag"] || r["montant"] || r["transaction amount"] || "";
    const rawLabel = r["description"] || r["omschrijving"] || r["libelle"] || r["memo"] || r["beneficiary name"] || "";
    const currency = r["currency"] || r["währung"] || r["devise"] || "EUR";

    if (!rawDate || !rawAmount) continue;

    // Parse la date (formats : DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY)
    const date = normalizeDate(rawDate);
    if (!date) continue;

    // Parse le montant (gère virgule décimale FR et point EN)
    const amount = parseAmount(rawAmount);
    if (isNaN(amount)) continue;

    txs.push({
      date,
      label: rawLabel.trim() || "Transaction bunq",
      amount,
      currency: currency.trim() || "EUR",
      rawLine: JSON.stringify(row),
    });
  }

  return txs;
}

// ─── Parseur PDF via Tesseract OCR ───────────────────────────────────────────

/**
 * Extrait les transactions d'un PDF bunq via OCR Tesseract.js.
 * Note : Tesseract traite les images — le PDF est d'abord rendu page par page.
 * Pour simplifier sans pdf2image, on tente de lire le texte brut du PDF (souvent lisible).
 */
export async function parseBunqPdf(buffer: Buffer): Promise<ParsedBunqTransaction[]> {
  // 1. Essai extraction texte brut (PDFs textuels)
  const rawText = extractTextFromPdf(buffer);
  if (rawText && rawText.length > 50) {
    const txs = parseTextualStatement(rawText);
    if (txs.length > 0) return txs;
  }

  // 2. Fallback : OCR Tesseract sur les données brutes
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng+fra", 1, {
      logger: () => {}, // silence les logs Tesseract
    });
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    return parseTextualStatement(text);
  } catch (err: any) {
    console.error("[bunq] OCR Tesseract error:", err.message);
    return [];
  }
}

/** Extraction basique de texte depuis un PDF (format textuel simple) */
function extractTextFromPdf(buffer: Buffer): string {
  const str = buffer.toString("latin1");
  // Extrait le contenu entre opérateurs PDF BT/ET (text blocks)
  const matches = str.match(/BT[\s\S]*?ET/g) || [];
  const texts: string[] = [];
  for (const block of matches) {
    const tjs = block.match(/\(([^)]+)\)\s*Tj/g) || [];
    for (const tj of tjs) {
      const m = tj.match(/\(([^)]+)\)/);
      if (m) texts.push(m[1]);
    }
  }
  return texts.join(" ");
}

/**
 * Parse un relevé bancaire textuel (extrait depuis PDF ou OCR).
 * Tente de détecter des lignes du type : DD/MM/YYYY  Libellé  -42.50 EUR
 */
function parseTextualStatement(text: string): ParsedBunqTransaction[] {
  const txs: ParsedBunqTransaction[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Pattern : date, texte, montant (avec + ou -)
  const linePattern = /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+(.+?)\s+([-+]?\d[\d\s.,]*)\s*(EUR|USD|GBP)?$/i;

  for (const line of lines) {
    const m = line.match(linePattern);
    if (!m) continue;
    const date = normalizeDate(m[1]);
    if (!date) continue;
    const label = m[2].trim();
    const amount = parseAmount(m[3]);
    if (isNaN(amount)) continue;
    const currency = (m[4] || "EUR").toUpperCase();
    txs.push({ date, label, amount, currency, rawLine: line });
  }

  return txs;
}

// ─── Parseur ZIP ──────────────────────────────────────────────────────────────

export async function parseBunqZip(buffer: Buffer): Promise<SyncResult[]> {
  const unzipper = await import("unzipper");
  const results: SyncResult[] = [];

  const directory = await unzipper.Open.buffer(buffer);

  for (const file of directory.files) {
    if (file.type === "Directory") continue;

    const filename = path.basename(file.path);
    if (!isSafeFilename(filename)) {
      console.warn(`[bunq] ZIP: fichier ignoré (non autorisé) : ${filename}`);
      continue;
    }

    const ext = path.extname(filename).toLowerCase();
    const content = await file.buffer();

    try {
      if (ext === ".csv") {
        const txs = parseBunqCsv(content);
        results.push({ filename, type: "csv", transactions: txs, errors: [] });
      } else if (ext === ".pdf") {
        const txs = await parseBunqPdf(content);
        results.push({ filename, type: "pdf", transactions: txs, errors: [] });
      } else {
        console.log(`[bunq] ZIP: extension ignorée ${ext} dans ${filename}`);
      }
    } catch (err: any) {
      results.push({ filename, type: ext === ".pdf" ? "pdf" : "csv", transactions: [], errors: [err.message] });
    }
  }

  return results;
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function normalizeDate(raw: string): string | null {
  const s = raw.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    let year = dmy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // MM/DD/YYYY (US)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const month = mdy[1].padStart(2, "0");
    const day = mdy[2].padStart(2, "0");
    return `${mdy[3]}-${month}-${day}`;
  }

  return null;
}

function parseAmount(raw: string): number {
  // Supprime espaces, remplace virgule par point
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  return parseFloat(cleaned);
}
