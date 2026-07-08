import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

console.log('[DB] Connexion via DATABASE_URL (Replit built-in)');

export const pool = new Pool({ connectionString });
export const db = drizzle({ client: pool, schema });
