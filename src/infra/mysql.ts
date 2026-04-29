/**
 * src/infra/mysql.ts
 * Pool de connexions MySQL — Singleton.
 *
 * Pattern Singleton : une seule instance du pool pour toute l'application.
 * Pourquoi un pool ? Réutiliser les connexions TCP évite d'en ouvrir une
 * nouvelle à chaque requête (coûteux). Le pool gère jusqu'à MYSQL_POOL_LIMIT
 * connexions simultanées.
 */
import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { env } from '../config/env';

let pool: Pool | null = null;

/**
 * Retourne le pool existant ou en crée un nouveau.
 * Utilisation : await getPool().execute(...)
 */
export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host:               env.MYSQL_HOST,
      port:               env.MYSQL_PORT,
      database:           env.MYSQL_DATABASE,
      user:               env.MYSQL_USER,
      password:           env.MYSQL_PASSWORD,
      connectionLimit:    env.MYSQL_POOL_LIMIT,
      waitForConnections: true,   // file d'attente si toutes les connexions sont prises
      queueLimit:         0,      // 0 = file illimitée
      timezone:           '+00:00',
    });
  }
  return pool;
}

/**
 * Teste la connexion au démarrage.
 * "Crash fast" : si MySQL est injoignable, on arrête immédiatement.
 */
export async function testConnection(): Promise<void> {
  const conn = await getPool().getConnection();
  await conn.ping();
  conn.release();
  console.log('✅ MySQL connecté');
}

/**
 * Exécute une fonction dans une transaction MySQL.
 * Si la fonction lève une exception, rollback automatique.
 * Sinon, commit.
 *
 * Usage :
 *   await withTransaction(async (conn) => {
 *     await conn.execute('INSERT ...', [...]);
 *     await conn.execute('UPDATE ...', [...]);
 *   });
 */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
