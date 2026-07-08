import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import fs from "fs";
import path from "path";

let plaidClient: PlaidApi | null = null;

const TOKENS_FILE = path.join(process.cwd(), ".plaid_tokens.json");

function loadTokens(): string[] {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error("Error loading Plaid tokens:", e);
  }
  return [];
}

function saveTokens(tokens: string[]): void {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens), "utf-8");
  } catch (e) {
    console.error("Error saving Plaid tokens:", e);
  }
}

function getPlaidClient(): PlaidApi {
  if (!plaidClient) {
    const clientId = process.env.PLAID_CLIENT_ID || "testing";
    const secret = process.env.PLAID_SECRET || "testing";

    if (!clientId || !secret) {
      throw new Error("PLAID_CLIENT_ID et PLAID_SECRET doivent être configurés.");
    }

    const env = process.env.PLAID_ENV === "production"
      ? PlaidEnvironments.production
      : PlaidEnvironments.development;

    console.log(`[Plaid] Initializing with environment: ${process.env.PLAID_ENV || 'sandbox (defaulted to development)'}`);

    const configuration = new Configuration({
      basePath: env,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    });

    plaidClient = new PlaidApi(configuration);
  }

  return plaidClient;
}

export async function createLinkToken(userId: string): Promise<string> {
  const client = getPlaidClient();

  const response = await client.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "MyJantes",
    products: [Products.Auth, Products.Transactions],
    country_codes: [CountryCode.Fr],
    language: "fr",
  });

  return response.data.link_token;
}

export async function exchangePublicToken(publicToken: string): Promise<{ access_token: string; item_id: string }> {
  const client = getPlaidClient();

  const response = await client.itemPublicTokenExchange({
    public_token: publicToken,
  });

  const accessToken = response.data.access_token;
  const itemId = response.data.item_id;

  const tokens = loadTokens();
  if (!tokens.includes(accessToken)) {
    tokens.push(accessToken);
    saveTokens(tokens);
  }

  return { access_token: accessToken, item_id: itemId };
}

export async function getAccounts(): Promise<any[]> {
  const client = getPlaidClient();
  const tokens = loadTokens();
  const allAccounts: any[] = [];

  for (const token of tokens) {
    try {
      const response = await client.accountsGet({ access_token: token });
      const institution = response.data.item?.institution_id;

      for (const account of response.data.accounts) {
        allAccounts.push({
          id: account.account_id,
          name: account.name,
          official_name: account.official_name,
          type: account.type,
          subtype: account.subtype,
          mask: account.mask,
          institution_id: institution,
          balances: {
            current: account.balances.current,
            available: account.balances.available,
            currency: account.balances.iso_currency_code || "EUR",
          },
        });
      }
    } catch (error: any) {
      console.error("Plaid getAccounts error for token:", error.message);
    }
  }

  return allAccounts;
}

export async function getBalances(): Promise<any[]> {
  const client = getPlaidClient();
  const tokens = loadTokens();
  const allAccounts: any[] = [];

  for (const token of tokens) {
    try {
      const response = await client.accountsBalanceGet({ access_token: token });

      for (const account of response.data.accounts) {
        allAccounts.push({
          id: account.account_id,
          name: account.name,
          official_name: account.official_name,
          type: account.type,
          subtype: account.subtype,
          mask: account.mask,
          balances: {
            current: account.balances.current,
            available: account.balances.available,
            currency: account.balances.iso_currency_code || "EUR",
          },
        });
      }
    } catch (error: any) {
      console.error("Plaid getBalances error for token:", error.message);
    }
  }

  return allAccounts;
}

export function isPlaidConfigured(): boolean {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}
