/**
 * src/patterns/AdherentActiveRecord.ts
 * Pattern Active Record — illustration pédagogique.
 *
 * ─── Différence clé avec Repository ───────────────────────────────────────
 *
 *  Repository :
 *    • L'entité `Adherent` est un POJO inerte (interface, pas de méthodes).
 *    • La persistance vit AILLEURS, dans une classe Repository dédiée.
 *    • Couplage faible : on peut tester l'entité sans toucher à la BDD.
 *    • Usage : repo.create(data), repo.update(id, data), repo.deactivate(id).
 *
 *  Active Record :
 *    • L'entité `AdherentAR` PORTE elle-même les méthodes de persistance.
 *    • Elle CONNAÎT la BDD (un appel à `getPool()` est caché dedans).
 *    • Couplage fort : impossible d'utiliser l'entité sans MySQL connecté.
 *    • Usage : adherent.save(), adherent.deactivate(), adherent.delete().
 *
 *  Marque distinctive à l'oral du jury :
 *    "Avec Active Record, c'est `adherent.save()` ;
 *     avec Repository, c'est `repo.save(adherent)`."
 *
 *  Quand utiliser Active Record ?
 *    • Petites apps, prototypes, scripts.
 *    • Frameworks fournissant l'AR de série : Rails, Laravel Eloquent, Django ORM.
 *    • Quand productivité > testabilité.
 *
 *  Limites :
 *    • "Fat model" : la classe mélange règles métier ET accès BDD.
 *    • Tests unitaires douloureux (il faut mocker la BDD ou tout faire en intégration).
 *    • Réutilisation difficile si on veut changer de stockage.
 */
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool } from '../infra/mysql';

const COLS = 'id, nom, prenom, email, telephone, actif, date_inscription';

export class AdherentAR {
  id?: number;
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  actif: boolean;
  dateInscription?: Date;

  constructor(data: {
    id?: number;
    nom: string;
    prenom: string;
    email: string;
    telephone?: string | null;
    actif?: boolean;
    dateInscription?: Date;
  }) {
    this.id              = data.id;
    this.nom             = data.nom;
    this.prenom          = data.prenom;
    this.email           = data.email;
    this.telephone       = data.telephone ?? null;
    this.actif           = data.actif ?? true;
    this.dateInscription = data.dateInscription;
  }

  // ─── Finders statiques ───────────────────────────────────────────────────
  // Ils restent statiques car on n'a pas encore d'instance pour les appeler.

  static async findById(id: number): Promise<AdherentAR | null> {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT ${COLS} FROM adherent WHERE id = ?`,
      [id]
    );
    return rows[0] ? AdherentAR.fromRow(rows[0]) : null;
  }

  static async findAll(): Promise<AdherentAR[]> {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT ${COLS} FROM adherent ORDER BY nom, prenom`
    );
    return rows.map(AdherentAR.fromRow);
  }

  /** Mapper interne : ligne BDD → instance Active Record. */
  private static fromRow(r: RowDataPacket): AdherentAR {
    return new AdherentAR({
      id:              r.id,
      nom:             r.nom,
      prenom:          r.prenom,
      email:           r.email,
      telephone:       r.telephone ?? null,
      actif:           Boolean(r.actif),
      dateInscription: r.date_inscription,
    });
  }

  // ─── Méthodes d'instance — la marque de l'Active Record ──────────────────
  // L'entité elle-même sait s'écrire en BDD.

  /**
   * INSERT si l'id est absent, UPDATE sinon.
   * Met à jour `this.id` et `this.dateInscription` après insertion.
   */
  async save(): Promise<this> {
    if (this.id === undefined) {
      const [res] = await getPool().execute<ResultSetHeader>(
        `INSERT INTO adherent (nom, prenom, email, telephone, actif) VALUES (?, ?, ?, ?, ?)`,
        [this.nom, this.prenom, this.email, this.telephone, this.actif]
      );
      this.id = res.insertId;

      // Read-after-write pour récupérer date_inscription auto-générée par MySQL
      const refreshed = await AdherentAR.findById(this.id);
      if (refreshed) this.dateInscription = refreshed.dateInscription;
    } else {
      await getPool().execute<ResultSetHeader>(
        `UPDATE adherent SET nom = ?, prenom = ?, email = ?, telephone = ?, actif = ? WHERE id = ?`,
        [this.nom, this.prenom, this.email, this.telephone, this.actif, this.id]
      );
    }
    return this;
  }

  /** Soft delete — passe actif à false. Met à jour l'instance en mémoire. */
  async deactivate(): Promise<boolean> {
    if (this.id === undefined) return false;
    const [res] = await getPool().execute<ResultSetHeader>(
      `UPDATE adherent SET actif = 0 WHERE id = ?`,
      [this.id]
    );
    if (res.affectedRows > 0) {
      this.actif = false;
      return true;
    }
    return false;
  }

  /** Suppression physique. */
  async delete(): Promise<boolean> {
    if (this.id === undefined) return false;
    const [res] = await getPool().execute<ResultSetHeader>(
      `DELETE FROM adherent WHERE id = ?`,
      [this.id]
    );
    return res.affectedRows > 0;
  }
}
