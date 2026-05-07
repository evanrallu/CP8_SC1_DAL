/**
 * src/patterns/UnitOfWork.ts
 * Pattern Unit of Work — illustration pédagogique.
 *
 * ─── Différence clé avec Repository ───────────────────────────────────────
 *
 *  Repository :
 *    • Chaque méthode (create, update, delete) ouvre/ferme sa propre opération SQL.
 *    • Pas de notion de transaction inter-méthodes — chaque appel est autonome.
 *    • Si on enchaîne 5 create() et que le 3ᵉ échoue : les 2 premiers sont déjà
 *      committés en BDD → état incohérent.
 *
 *  Unit of Work :
 *    • Suit un ENSEMBLE de modifications (new / dirty / removed) sur potentiellement
 *      plusieurs entités, et les applique en UNE SEULE transaction MySQL.
 *    • Garantie d'atomicité : tout réussit, ou tout est annulé (ROLLBACK).
 *    • L'utilisateur enregistre ses opérations puis appelle `commit()` une fois.
 *
 *  Différence clé à l'oral du jury :
 *    "Avec un Repository classique, 5 create() = 5 transactions indépendantes ;
 *     avec un Unit of Work, 5 create() = 1 transaction atomique tout-ou-rien."
 *
 *  Quand utiliser UoW ?
 *    • Opérations multi-tables qui DOIVENT être atomiques (paiement + log,
 *      transfert d'argent, batch d'imports d'adhérents).
 *    • Quand la cohérence transactionnelle est critique pour le métier.
 *
 *  Démo ici : insertion en lot d'adhérents — soit tous créés, soit aucun.
 *  Si un email du batch est en doublon, MySQL lève ER_DUP_ENTRY → rollback de
 *  TOUS les inserts du batch (même ceux déjà passés dans la boucle).
 */
import { PoolConnection } from 'mysql2/promise';
import { getPool } from '../infra/mysql';
import { AdherentDAO, AdherentRow } from './AdherentDAO';

type NewAdherent = Omit<AdherentRow, 'id' | 'date_inscription'>;
type DirtyAdherent = { id: number; fields: Partial<NewAdherent> };
type RemovedAdherent = { id: number };

export class UnitOfWork {
  private newAdherents: NewAdherent[] = [];
  private dirtyAdherents: DirtyAdherent[] = [];
  private removedAdherents: RemovedAdherent[] = [];

  /** Enregistre un adhérent à insérer au commit. */
  registerNewAdherent(data: NewAdherent): void {
    this.newAdherents.push(data);
  }

  /** Enregistre un adhérent à mettre à jour au commit. */
  registerDirtyAdherent(id: number, fields: Partial<NewAdherent>): void {
    this.dirtyAdherents.push({ id, fields });
  }

  /** Enregistre un adhérent à supprimer au commit. */
  registerRemovedAdherent(id: number): void {
    this.removedAdherents.push({ id });
  }

  /**
   * Applique TOUTES les modifications enregistrées en une seule transaction.
   *   • Inserts d'abord, puis updates, puis deletes (ordre prévisible).
   *   • Si une seule étape échoue → ROLLBACK total et l'erreur est propagée.
   *   • La connexion est toujours libérée (release) à la fin (succès ou échec).
   */
  async commit(): Promise<{ insertedIds: number[] }> {
    const conn: PoolConnection = await getPool().getConnection();
    await conn.beginTransaction();

    try {
      // DAO scopé à la connexion transactionnelle :
      // toutes les requêtes passent par `conn`, donc participent à la transaction.
      const dao = new AdherentDAO(conn);
      const insertedIds: number[] = [];

      for (const row of this.newAdherents) {
        const id = await dao.insertRow(row);
        insertedIds.push(id);
      }
      for (const u of this.dirtyAdherents) {
        await dao.updateRow(u.id, u.fields);
      }
      for (const r of this.removedAdherents) {
        await dao.deleteRow(r.id);
      }

      await conn.commit();
      return { insertedIds };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
      // Reset — un UoW est typiquement à usage unique, mais on évite les surprises.
      this.newAdherents = [];
      this.dirtyAdherents = [];
      this.removedAdherents = [];
    }
  }
}
