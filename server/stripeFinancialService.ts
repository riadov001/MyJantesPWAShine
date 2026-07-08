import Stripe from "stripe";
import fs from "fs";
import path from "path";

const ACCOUNTS_FILE = path.join(process.cwd(), ".stripe_financial_accounts.json");
const CUSTOMER_FILE = path.join(process.cwd(), ".stripe_fc_customer.json");

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const secretKey = process.env.STRIPE_SECRET_KEY_PROD || 
                    process.env.STRIPE_SECRET_KEY || 
                    process.env.STRIPE_API_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY non configuré dans les Secrets.");
  }
  
  stripeInstance = new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });
  return stripeInstance;
}

function loadAccountIds(): string[] {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
      return Array.isArray(data) ? data : [];
    }
  } catch (e) {
    console.error("[StripeFinancial] Error loading account IDs:", e);
  }
  return [];
}

function saveAccountIds(ids: string[]): void {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(Array.from(new Set(ids))), "utf-8");
  } catch (e) {
    console.error("[StripeFinancial] Error saving account IDs:", e);
  }
}

async function getOrCreateFCCustomer(): Promise<string> {
  const stripe = getStripe();
  
  try {
    if (fs.existsSync(CUSTOMER_FILE)) {
      const data = JSON.parse(fs.readFileSync(CUSTOMER_FILE, "utf-8"));
      if (data.customerId) {
        const existing = await stripe.customers.retrieve(data.customerId);
        if (!(existing as any).deleted) {
          return data.customerId;
        }
      }
    }
  } catch (e) {
    console.log("[StripeFinancial] No existing FC customer found, creating new one");
  }

  const customer = await stripe.customers.create({
    name: "MyJantes - Compte Bancaire",
    email: "admin@myjantes.fr",
    metadata: { purpose: "financial_connections", internal: "true" },
  });

  fs.writeFileSync(CUSTOMER_FILE, JSON.stringify({ customerId: customer.id }), "utf-8");
  console.log(`[StripeFinancial] Created FC customer: ${customer.id}`);
  return customer.id;
}

export async function createFinancialSession(returnUrl: string): Promise<{ client_secret: string; id: string }> {
  const stripe = getStripe();
  
  const customerId = await getOrCreateFCCustomer();
  console.log(`[StripeFinancial] Creating session with customer: ${customerId}`);

  const sessionParams: any = {
    account_holder: { 
      type: "customer",
      customer: customerId,
    },
    permissions: ["balances", "transactions", "ownership", "payment_method"],
  };

  const session = await stripe.financialConnections.sessions.create(sessionParams);
  console.log(`[StripeFinancial] Session created: ${session.id}`);
  return { client_secret: session.client_secret as string, id: session.id };
}

export async function retrieveFinancialSession(sessionId: string): Promise<string[]> {
  const stripe = getStripe();
  const session = await stripe.financialConnections.sessions.retrieve(sessionId);
  const accountIds: string[] = [];
  if ((session as any).linked_accounts) {
    const list = (session as any).linked_accounts as any;
    const items = list.data || list;
    for (const acc of items) {
      if (acc.id) accountIds.push(acc.id);
    }
  }
  if (session.accounts) {
    const list = session.accounts as any;
    const items = list.data || list;
    for (const acc of items) {
      if (acc.id) accountIds.push(acc.id);
    }
  }
  const existing = loadAccountIds();
  saveAccountIds([...existing, ...accountIds]);
  return accountIds;
}

export async function listConnectedAccounts(): Promise<any[]> {
  const stripe = getStripe();
  const ids = loadAccountIds();
  const accounts: any[] = [];

  for (const id of ids) {
    try {
      const acc = await stripe.financialConnections.accounts.retrieve(id);
      accounts.push(formatAccount(acc));
    } catch (e: any) {
      console.error(`[StripeFinancial] Error retrieving account ${id}:`, e.message);
    }
  }
  return accounts;
}

export async function refreshAccountBalance(accountId: string): Promise<any> {
  const stripe = getStripe();
  try {
    await (stripe.financialConnections.accounts as any).refresh(accountId, {
      features: ["balance"],
    });
    const acc = await stripe.financialConnections.accounts.retrieve(accountId);
    return formatAccount(acc);
  } catch (e: any) {
    console.error(`[StripeFinancial] Error refreshing balance for ${accountId}:`, e.message);
    const acc = await stripe.financialConnections.accounts.retrieve(accountId);
    return formatAccount(acc);
  }
}

export async function listTransactions(accountId: string, limit = 100): Promise<any[]> {
  const stripe = getStripe();
  try {
    const txns = await (stripe.financialConnections as any).transactions.list({
      account: accountId,
      limit,
    });
    const items = txns.data || [];
    return items.map(formatTransaction);
  } catch (e: any) {
    console.error(`[StripeFinancial] Error listing transactions for ${accountId}:`, e.message);
    return [];
  }
}

export async function disconnectAccount(accountId: string): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.financialConnections.accounts.disconnect(accountId);
  } catch (e: any) {
    console.error(`[StripeFinancial] Error disconnecting account ${accountId}:`, e.message);
  }
  const ids = loadAccountIds().filter((id) => id !== accountId);
  saveAccountIds(ids);
}

export function isStripeFinancialConfigured(): boolean {
  const hasSecret = !!process.env.STRIPE_SECRET_KEY_PROD || !!process.env.STRIPE_SECRET_KEY || !!process.env.STRIPE_API_KEY;
  const hasPublishable = !!process.env.STRIPE_PUBLISHABLE_KEY_PROD || !!process.env.STRIPE_PUBLISHABLE_KEY;
  return hasSecret && hasPublishable;
}

function formatAccount(acc: any): any {
  return {
    id: acc.id,
    display_name: acc.display_name || acc.institution_name || "Compte bancaire",
    institution_name: acc.institution_name || "",
    last4: acc.last4 || null,
    category: acc.category || "checking",
    subcategory: acc.subcategory || null,
    currency: acc.balance?.cash?.available
      ? Object.keys(acc.balance.cash.available)[0] || "eur"
      : "eur",
    balance: {
      current: acc.balance?.cash?.available
        ? Object.values(acc.balance.cash.available as Record<string, number>)[0] / 100
        : null,
      as_of: acc.balance_refresh?.last_attempted_at
        ? new Date(acc.balance_refresh.last_attempted_at * 1000).toISOString()
        : null,
    },
    status: acc.status || "active",
    permissions: acc.permissions || [],
  };
}

function formatTransaction(tx: any): any {
  return {
    id: tx.id,
    amount: tx.amount / 100,
    currency: tx.currency || "eur",
    description: tx.description || "",
    status: tx.status || "posted",
    transacted_at: tx.transacted_at
      ? new Date(tx.transacted_at * 1000).toISOString()
      : new Date().toISOString(),
    category: tx.amount < 0 ? "debit" : "credit",
  };
}
