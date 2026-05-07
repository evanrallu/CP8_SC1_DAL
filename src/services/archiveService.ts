/**
 * src/services/archiveService.ts
 * SC03 — Livrable 2 : Appel de la procédure stockée sp_archive_old_seances.
 *
 * Pourquoi une procédure stockée ici ?
 *  - L'archivage (INSERT INTO seance_archive + DELETE FROM seance) est une
 *    opération critique qui doit être atomique.
 *  - Elle peut traiter des milliers de lignes → 1 seul aller-retour réseau
 *    au lieu de N (gain de perf majeur).
 *  - Principe du moindre privilège : cineclub_app a GRANT EXECUTE sur la
 *    procédure, mais n'a PAS besoin de GRANT DELETE sur seance.
 *
 * ⚠️  Piège principal : le SELECT @nb DOIT être sur la MÊME connexion que le
 *     CALL. Les variables de session (@xxx) sont scopées par connexion MySQL.
 *     C'est pour ça qu'on utilise getConnection() explicitement et qu'on ne
 *     lâche la connexion qu'en finally.
 */
import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../infra/mysql';

/**
 * Archive les séances dont la date est antérieure à `avantDate`.
 *
 * @param avantDate  Date limite (exclusive) — les séances < avantDate sont archivées
 * @returns          Nombre de séances archivées (paramètre OUT de la procédure)
 */
export async function archiveOldSeances(avantDate: Date): Promise<number> {
  // On récupère UNE connexion dédiée (pas pool.execute !)
  // → nécessaire pour que @nb soit visible sur la même connexion
  const conn = await getPool().getConnection();

  try {
    // ① CALL la procédure — le paramètre OUT est capturé dans @nb (variable de session)
    await conn.query(
      'CALL sp_archive_old_seances(?, @nb)',
      [avantDate],
    );

    // ② Lire @nb sur la MÊME connexion
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT @nb AS nb',
    );

    return Number(rows[0].nb);

  } finally {
    // La connexion retourne au pool dans TOUS les cas (succès ou erreur)
    conn.release();
  }
}
