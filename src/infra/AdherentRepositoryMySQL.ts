/**
 * src/infra/AdherentRepositoryMySQL.ts
 * Implémentation du Repository Adhérent avec mysql2/promise.
 *
 * Règles de sécurité appliquées :
 * ① execute() TOUJOURS (jamais query() avec des variables)
 * ② Placeholders ? pour chaque valeur (jamais ${variable} dans le SQL)
 * ③ Mapper toAdherent() : snake_case → camelCase, 0/1 → boolean
 * ④ Read-after-write après INSERT pour retourner l'entité complète
 * ⑤ affectedRows === 0 → null (entité introuvable) → 404 dans la route
 */
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool } from './mysql';
import { Adherent } from '../domain/Adherent';
import { CreateAdherentDTO, UpdateAdherentDTO } from '../schemas/adherentSchemas';

// ─── Mapper BDD → Domaine ───────────────────────────────────────────────────
// Traduit une ligne MySQL (snake_case, 0/1) en objet métier (camelCase, boolean)
function toAdherent(row: RowDataPacket): Adherent {
  return {
    id:              row.id,
    nom:             row.nom,
    prenom:          row.prenom,
    email:           row.email,
    telephone:       row.telephone ?? null,
    actif:           Boolean(row.actif),   // MySQL stocke 0/1, JS veut true/false
    dateInscription: row.date_inscription,
  };
}

// ─── Colonnes à sélectionner (évite SELECT *) ──────────────────────────────
const COLS = 'id, nom, prenom, email, telephone, actif, date_inscription';

// ─── Classe Repository ─────────────────────────────────────────────────────
export class AdherentRepositoryMySQL {

  /** Récupère tous les adhérents actifs */
  async findAll(): Promise<Adherent[]> {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT ${COLS} FROM adherent WHERE actif = 1 ORDER BY nom, prenom`
    );
    return rows.map(toAdherent);
  }

  /** Récupère un adhérent par son id. Retourne null si introuvable. */
  async findById(id: number): Promise<Adherent | null> {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT ${COLS} FROM adherent WHERE id = ?`,
      [id]  // ← valeur passée en tableau séparé, jamais interpolée dans le SQL
    );
    return rows[0] ? toAdherent(rows[0]) : null;
  }

  /** Récupère un adhérent par email (utile pour vérifier les doublons) */
  async findByEmail(email: string): Promise<Adherent | null> {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT ${COLS} FROM adherent WHERE email = ?`,
      [email]
    );
    return rows[0] ? toAdherent(rows[0]) : null;
  }

  /**
   * Crée un nouvel adhérent.
   * Read-after-write : après l'INSERT, on relit l'enregistrement avec findById()
   * pour retourner l'entité telle que MySQL la voit (valeurs par défaut, triggers…)
   */
  async create(data: CreateAdherentDTO): Promise<Adherent> {
    const [result] = await getPool().execute<ResultSetHeader>(
      `INSERT INTO adherent (nom, prenom, email, telephone, actif)
       VALUES (?, ?, ?, ?, ?)`,
      [data.nom, data.prenom, data.email, data.telephone ?? null, true]
    );
    // result.insertId = l'id auto-généré par MySQL
    return (await this.findById(result.insertId))!;
  }

  /**
   * Met à jour un adhérent.
   * Retourne null si aucune ligne modifiée (id inexistant).
   */
  async update(id: number, data: UpdateAdherentDTO): Promise<Adherent | null> {
    // Construction dynamique des champs à mettre à jour
    // (évite d'écraser les champs non fournis dans un PATCH partiel)
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.nom      !== undefined) { fields.push('nom = ?');       values.push(data.nom); }
    if (data.prenom   !== undefined) { fields.push('prenom = ?');    values.push(data.prenom); }
    if (data.email    !== undefined) { fields.push('email = ?');     values.push(data.email); }
    if (data.telephone !== undefined) { fields.push('telephone = ?'); values.push(data.telephone); }

    // Rien à mettre à jour → on retourne l'entité telle quelle
    if (fields.length === 0) return this.findById(id);

    values.push(id); // ← pour le WHERE id = ?

    const [result] = await getPool().execute<ResultSetHeader>(
      `UPDATE adherent SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) return null; // id introuvable → 404
    return this.findById(id);
  }

  /**
   * Désactive un adhérent (soft delete).
   * On ne supprime jamais physiquement pour conserver l'historique.
   */
  async deactivate(id: number): Promise<boolean> {
    const [result] = await getPool().execute<ResultSetHeader>(
      `UPDATE adherent SET actif = 0 WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Suppression physique — à n'utiliser que si aucune FK ne pointe dessus.
   * Retourne true si supprimé, false si introuvable.
   */
  async delete(id: number): Promise<boolean> {
    const [result] = await getPool().execute<ResultSetHeader>(
      `DELETE FROM adherent WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }
}
