/**
 * CP8-SC1 — Connexion MySQL sécurisée
 *
 * Pattern singleton : le pool est créé UNE fois, réutilisé partout.
 * Pas un pool par requête.
 *
 * Ref: slide 12 — Connexion MySQL, code complet TypeScript
 */

import mysql, { Pool } from "mysql2/promise";
import "dotenv/config";

let pool: Pool | null = null;

/**
 * Retourne le pool MySQL (singleton).
 * Créé au premier appel, réutilisé ensuite.
 */
export function getPool(): Pool {
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER!,
    password: process.env.DB_PASS!,
    database: process.env.DB_NAME!,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    timezone: "Z",
  });

  return pool;
}

/**
 * Teste la connexion MySQL au démarrage.
 * Si la BDD ne répond pas, on arrête l'app.
 */
export async function testConnection(): Promise<void> {
  const conn = await getPool().getConnection();
  await conn.ping();
  conn.release();
}
