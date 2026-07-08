import fs from "fs";
import path from "path";

const BRIDGE_API = "https://api.bridgeapi.io";
const BRIDGE_VERSION = "2025-01-15";
const BRIDGE_USER_FILE = path.join(process.cwd(), ".bridge_user.json");
const BRIDGE_TOKEN_CACHE_FILE = path.join(process.cwd(), ".bridge_token_cache.json");

function getClientId(): string {
  return process.env.BRIDGE_CLIENT_ID || "";
}

function getClientSecret(): string {
  return process.env.BRIDGE_CLIENT_SECRET || "";
}

function baseHeaders(): Record<string, string> {
  return {
    "Bridge-Version": BRIDGE_VERSION,
    "Client-Id": getClientId(),
    "Client-Secret": getClientSecret(),
    "Content-Type": "application/json",
  };
}

export function isBridgeConfigured(): boolean {
  return !!(getClientId() && getClientSecret());
}

interface BridgeUserData {
  uuid: string;
  external_user_id: string;
}

interface TokenCache {
  access_token: string;
  expires_at: string;
  user_uuid: string;
}

function loadUserData(): BridgeUserData | null {
  try {
    if (fs.existsSync(BRIDGE_USER_FILE)) {
      return JSON.parse(fs.readFileSync(BRIDGE_USER_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

function saveUserData(data: BridgeUserData): void {
  fs.writeFileSync(BRIDGE_USER_FILE, JSON.stringify(data), "utf-8");
}

function loadTokenCache(): TokenCache | null {
  try {
    if (fs.existsSync(BRIDGE_TOKEN_CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(BRIDGE_TOKEN_CACHE_FILE, "utf-8"));
      if (cache.expires_at && new Date(cache.expires_at) > new Date(Date.now() + 60_000)) {
        return cache;
      }
    }
  } catch {}
  return null;
}

function saveTokenCache(cache: TokenCache): void {
  fs.writeFileSync(BRIDGE_TOKEN_CACHE_FILE, JSON.stringify(cache), "utf-8");
}

async function bridgeFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = `${BRIDGE_API}${endpoint}`;
  const resp = await fetch(url, {
    ...options,
    headers: { ...baseHeaders(), ...(options.headers || {}) },
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msg = data?.errors?.[0]?.message || `Bridge API error ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}

async function getOrCreateUser(email: string): Promise<BridgeUserData> {
  const externalUserId = email.replace(/[@.]/g, "-");
  const userFile = path.join(process.cwd(), `.bridge_user_${externalUserId}.json`);
  
  try {
    if (fs.existsSync(userFile)) {
      return JSON.parse(fs.readFileSync(userFile, "utf-8"));
    }
  } catch {}

  const data = await bridgeFetch("/v3/aggregation/users", {
    method: "POST",
    body: JSON.stringify({ external_user_id: externalUserId }),
  });

  const user: BridgeUserData = { uuid: data.uuid, external_user_id: data.external_user_id };
  fs.writeFileSync(userFile, JSON.stringify(user), "utf-8");
  console.log(`[Bridge] User created/loaded for ${email}: ${user.uuid}`);
  return user;
}

async function getAccessToken(email: string): Promise<string> {
  const externalUserId = email.replace(/[@.]/g, "-");
  const tokenFile = path.join(process.cwd(), `.bridge_token_${externalUserId}.json`);
  
  try {
    if (fs.existsSync(tokenFile)) {
      const cache = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
      if (cache.expires_at && new Date(cache.expires_at) > new Date(Date.now() + 60_000)) {
        return cache.access_token;
      }
    }
  } catch {}

  const user = await getOrCreateUser(email);

  const data = await bridgeFetch("/v3/aggregation/authorization/token", {
    method: "POST",
    body: JSON.stringify({ user_uuid: user.uuid }),
  });

  const cache: TokenCache = {
    access_token: data.access_token,
    expires_at: data.expires_at,
    user_uuid: user.uuid,
  };
  fs.writeFileSync(tokenFile, JSON.stringify(cache), "utf-8");
  return data.access_token;
}

async function authFetch(email: string, endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken(email);
  const url = `${BRIDGE_API}${endpoint}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      ...baseHeaders(),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msg = data?.errors?.[0]?.message || `Bridge API error ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function createConnectSession(email: string, callbackUrl: string): Promise<{ id: string; url: string }> {
  const data = await authFetch(email, "/v3/aggregation/connect-sessions", {
    method: "POST",
    body: JSON.stringify({
      callback_url: callbackUrl,
      user_email: email,
    }),
  });
  return { id: data.id, url: data.url };
}

export async function listItems(email: string): Promise<any[]> {
  const data = await authFetch(email, "/v3/aggregation/items");
  return (data.resources || []).map(formatItem);
}

export async function listAccounts(email: string): Promise<any[]> {
  const data = await authFetch(email, "/v3/aggregation/accounts");
  return (data.resources || []).map(formatAccount);
}

export async function listTransactions(email: string, accountId: number | string, limit = 100): Promise<any[]> {
  try {
    const data = await authFetch(email, `/v3/aggregation/accounts/${accountId}/transactions?limit=${limit}`);
    return (data.resources || []).map(formatTransaction);
  } catch (e: any) {
    console.error(`[Bridge] Error fetching transactions for account ${accountId}:`, e.message);
    return [];
  }
}

export async function deleteItem(email: string, itemId: number | string): Promise<void> {
  await authFetch(email, `/v3/aggregation/items/${itemId}`, { method: "DELETE" });
}

export async function refreshItem(email: string, itemId: number | string): Promise<any> {
  await authFetch(email, `/v3/aggregation/items/${itemId}/refresh`, { method: "POST" });
  const items = await listItems(email);
  return items.find((i) => i.id === itemId) || null;
}

export async function getDashboard(email: string): Promise<{
  items: any[];
  accounts: any[];
  totalBalance: number;
}> {
  const [items, accounts] = await Promise.all([listItems(email), listAccounts(email)]);
  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
  return { items, accounts, totalBalance };
}

function formatItem(item: any): any {
  return {
    id: item.id,
    bank_name: item.bank?.name || "Banque inconnue",
    bank_logo: item.bank?.logo_url || null,
    status: item.status || "ok",
    status_code_info: item.status_code_info || null,
    last_refreshed_at: item.last_refreshed_at || null,
    bank_id: item.bank?.id || null,
  };
}

function formatAccount(account: any): any {
  return {
    id: account.id,
    name: account.name || "Compte",
    balance: typeof account.balance === "number" ? account.balance : null,
    currency_code: account.currency_code || "EUR",
    type: account.type || "checking",
    iban: account.iban || null,
    item_id: account.item_id || null,
    status: account.status || "ok",
    last_refreshed_at: account.last_refreshed_at || null,
    bank_name: account.item?.bank?.name || null,
  };
}

function formatTransaction(tx: any): any {
  return {
    id: tx.id,
    label: tx.label || tx.clean_description || "Transaction",
    amount: typeof tx.amount === "number" ? tx.amount : 0,
    currency_code: tx.currency_code || "EUR",
    date: tx.date || tx.value_date || new Date().toISOString().split("T")[0],
    category_id: tx.category_id || null,
    is_deleted: tx.is_deleted || false,
    type: tx.amount >= 0 ? "credit" : "debit",
  };
}
