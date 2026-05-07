/**
 * src/patterns/AdherentDAO.ts
 * Pattern DAO (Data Access Object) — illustration pédagogique.
 *
 * ─── Différence clé avec Repository ───────────────────────────────────────
 *
 *  Repository (cf. AdherentRepositoryMySQL) :
 *    • Orienté DOMAINE — renvoie des objets métier `Adherent` (camelCase, boolean).
 *    • Méthodes formulées en termes du domaine : findActiveAdherents, register…
 *    • Peut traverser plusieurs tables pour reconstituer un agrégat.
 *    • Cache au reste de l'app le fait qu'il y a une BDD derrière.
 *
 *  DAO :
 *    • Orienté STOCKAGE — renvoie des lignes BRUTES `AdherentRow` (snake_case, 0/1).
 *    • Méthodes formulées en termes SQL : selectById, insertRow, updateRow…
 *    • Une DAO = une table. Pas de logique métier, pas de mapping vers le domaine.
 *    • Brique technique de bas niveau, plus proche de la BDD.
 *
 *  Quand utiliser DAO plutôt que Repository ?
 *    • Couche très basse : ETL, scripts d'import, migrations, seeders.
 *    • Comme brique interne d'un Repository : un Repository peut orchestrer
 *      plusieurs DAO pour reconstituer un agrégat métier.
 *    • Quand on n'a pas besoin (ou pas envie) de modèle de domaine riche.
 *
 *  Sécurité (identique au Repository) : execute() + placeholders ?, jamais d'interpolation.
 */
import { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool } from '../infra/mysql';

/**
 * Type reflet exact d'une ligne de la table `adherent`.
 * Différences notables avec l'interface domaine `Adherent` :
 *   - `actif` : `number` (0/1) au lieu de `boolean`
 *   - `date_inscription` : snake_case, conforme à la colonne SQL
 * → C'est volontaire : la DAO expose la BDD telle qu'elle est.
 */
export interface AdherentRow {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  actif: number;
  date_inscription: Date;
}

// La DAO peut être branchée sur un Pool (par défaut) OU sur une PoolConnection
// transactionnelle (utile pour le pattern Unit of Work — voir UnitOfWork.ts).
type Executor = Pool | PoolConnection;

const COLS = 'id, nom, prenom, email, telephone, actif, date_inscription';

export class AdherentDAO {
  constructor(private readonly exec: Executor = getPool()) {}

  /** Sélectionne une ligne brute par id. Aucun mapping vers le domaine. */
  async selectById(id: number): Promise<AdherentRow | null> {
    const [rows] = await this.exec.execute<RowDataPacket[]>(
      `SELECT ${COLS} FROM adherent WHERE id = ?`,
      [id]
    );
    return (rows[0] as AdherentRow) ?? null;
  }

  /** Sélectionne toutes les lignes (sans filtre métier). */
  async selectAll(): Promise<AdherentRow[]> {
    const [rows] = await this.exec.execute<RowDataPacket[]>(
      `SELECT ${COLS} FROM adherent ORDER BY nom, prenom`
    );
    return rows as AdherentRow[];
  }

  /** Insère une ligne. Retourne l'id auto-généré. */
  async insertRow(row: Omit<AdherentRow, 'id' | 'date_inscription'>): Promise<number> {
    const [res] = await this.exec.execute<ResultSetHeader>(
      `INSERT INTO adherent (nom, prenom, email, telephone, actif) VALUES (?, ?, ?, ?, ?)`,
      [row.nom, row.prenom, row.email, row.telephone, row.actif]
    );
    return res.insertId;
  }

  /** UPDATE partiel par champ. Retourne le nb de lignes affectées. */
  async updateRow(
    id: number,
    fields: Partial<Omit<AdherentRow, 'id' | 'date_inscription'>>
  ): Promise<number> {
    const keys = Object.keys(fields);
    if (keys.length === 0) return 0;

    const setSql = keys.map(k => `${k} = ?`).join(', ');
    type Param = string | number | boolean | null;
    const values: Param[] = [
      ...keys.map(k => (fields as Record<string, Param>)[k]),
      id,
    ];

    const [res] = await this.exec.execute<ResultSetHeader>(
      `UPDATE adherent SET ${setSql} WHERE id = ?`,
      values
    );
    return res.affectedRows;
  }

  /** DELETE physique. Retourne le nb de lignes supprimées (0 ou 1). */
  async deleteRow(id: number): Promise<number> {
    const [res] = await this.exec.execute<ResultSetHeader>(
      `DELETE FROM adherent WHERE id = ?`,
      [id]
    );
    return res.affectedRows;
  }
}
