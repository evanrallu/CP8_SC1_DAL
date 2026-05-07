/**
 * src/services/ReservationServiceOpti.ts
 * SC03 — Bonus : Réservation avec verrouillage OPTIMISTE (colonne version).
 *
 * Différence avec ReservationService (pessimiste) :
 *  - Pas de SELECT … FOR UPDATE → pas de verrou côté SGBD
 *  - On lit la version actuelle, puis on UPDATE conditionné par version
 *  - Si affectedRows === 0 → quelqu'un a modifié entre notre SELECT et notre
 *    UPDATE → on lève ConflictError → le contrôleur retente jusqu'à MAX_RETRIES
 *
 * Quand choisir optimiste vs pessimiste ?
 *  - Pessimiste (FOR UPDATE) : conflits FRÉQUENTS (dernière place, événement
 *    Marvel, billets de concert)
 *  - Optimiste (version)     : conflits RARES (séances ordinaires, beaucoup
 *    de places) — scale mieux car aucune file d'attente côté SGBD
 *
 * Prérequis : ALTER TABLE seance ADD COLUMN version INT NOT NULL DEFAULT 0;
 *   → voir db/migrations/006_seance_version.sql
 */
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../infra/mysql';
import { ReservationResultDTO } from '../domain/Reservation';

// ─── Erreurs métier ────────────────────────────────────────────────────────

export class ConflictError extends Error {
  constructor() {
    super('Séance modifiée concurremment — retry nécessaire');
    this.name = 'ConflictError';
  }
}

export class SeanceNotFoundError extends Error {
  constructor(id: number) {
    super(`Séance introuvable : id=${id}`);
    this.name = 'SeanceNotFoundError';
  }
}

export class NoSeatsError extends Error {
  constructor(id: number) {
    super(`Plus de places disponibles pour la séance id=${id}`);
    this.name = 'NoSeatsError';
  }
}

// ─── Service ──────────────────────────────────────────────────────────────

export interface ReserverInput {
  adherentId:   number;
  seanceId:     number;
  montantCents: number;
}

export async function reserverOpti(input: ReserverInput): Promise<ReservationResultDTO> {
  return withTransaction(async (conn) => {

    // ① Lire la version actuelle (lecture simple, sans verrou)
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT places_restantes, version FROM seance WHERE id = ?',
      [input.seanceId],
    );

    if (rows.length === 0) throw new SeanceNotFoundError(input.seanceId);

    const { places_restantes, version } = rows[0];
    if (places_restantes < 1) throw new NoSeatsError(input.seanceId);

    // ② UPDATE conditionné par la version
    //   WHERE id = ? AND version = ?
    //   → Si quelqu'un a modifié entre notre SELECT et ici,
    //     sa version a augmenté → notre WHERE ne matche plus → affectedRows = 0
    const [updResult] = await conn.execute<ResultSetHeader>(
      `UPDATE seance
          SET places_restantes = places_restantes - 1,
              version          = version + 1
        WHERE id      = ?
          AND version = ?`,
      [input.seanceId, version],
    );

    if (updResult.affectedRows === 0) {
      // La séance a été modifiée par une autre transaction entre notre
      // SELECT et cet UPDATE → conflit optimiste
      throw new ConflictError();
    }

    // ③ INSERT reservation + paiement (identique au service pessimiste)
    const [resResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO reservation (adherent_id, seance_id, statut)
       VALUES (?, ?, 'CONFIRMEE')`,
      [input.adherentId, input.seanceId],
    );

    await conn.execute(
      `INSERT INTO paiement (reservation_id, montant_cents, statut)
       VALUES (?, ?, 'EN_ATTENTE')`,
      [resResult.insertId, input.montantCents],
    );

    return {
      reservationId:  resResult.insertId,
      statut:         'CONFIRMEE',
      paiementStatut: 'EN_ATTENTE',
      montantCents:   input.montantCents,
    };
  });
}
