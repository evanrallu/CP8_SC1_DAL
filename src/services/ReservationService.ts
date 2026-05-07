/**
 * src/services/ReservationService.ts
 * SC03 — Livrable 1 : Réservation transactionnelle (verrouillage PESSIMISTE).
 *
 * Stratégie :
 *  ① SELECT … FOR UPDATE  → verrou exclusif sur la ligne séance
 *  ② Vérifier places_restantes > 0 (sinon throw NoSeatsError)
 *  ③ INSERT reservation
 *  ④ UPDATE places_restantes - 1
 *  ⑤ INSERT paiement (montant > 0, sinon la contrainte CHECK lèvera une
 *     exception → rollback automatique via withTransaction)
 *
 * Pourquoi SELECT FOR UPDATE et pas juste UPDATE ?
 *   Sans le FOR UPDATE, deux transactions concurrentes peuvent lire
 *   places_restantes = 1 en même temps → toutes les deux font l'UPDATE
 *   → places_restantes tombe à -1 → surbooking.
 *   Le FOR UPDATE empêche la 2e transaction de progresser tant que la 1re
 *   n'a pas commité.
 */
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../infra/mysql';
import { ReservationResultDTO } from '../domain/Reservation';

// ─── Erreurs métier typées ──────────────────────────────────────────────────

/** La séance n'existe pas en base */
export class SeanceNotFoundError extends Error {
  constructor(id: number) {
    super(`Séance introuvable : id=${id}`);
    this.name = 'SeanceNotFoundError';
  }
}

/** Plus aucune place disponible */
export class NoSeatsError extends Error {
  constructor(id: number) {
    super(`Plus de places disponibles pour la séance id=${id}`);
    this.name = 'NoSeatsError';
  }
}

// ─── Interface d'entrée ────────────────────────────────────────────────────

export interface ReserverInput {
  adherentId:   number;
  seanceId:     number;
  montantCents: number;
}

// ─── Service principal ─────────────────────────────────────────────────────

/**
 * Réserve une place pour un adhérent à une séance.
 *
 * Tout le bloc est atomique via withTransaction() :
 *  - Si une exception survient n'importe où → rollback automatique
 *  - La connexion est libérée dans le finally de withTransaction
 */
export async function reserver(input: ReserverInput): Promise<ReservationResultDTO> {
  return withTransaction(async (conn) => {

    // ① Lire la séance ET poser un verrou exclusif dessus (FOR UPDATE)
    //   → Toute autre transaction qui veut SELECT FOR UPDATE ou UPDATE sur
    //     cette ligne attendra que celle-ci soit commitée ou rollbackée.
    const [seanceRows] = await conn.execute<RowDataPacket[]>(
      `SELECT places_restantes
         FROM seance
        WHERE id = ?
          FOR UPDATE`,        // ← verrou pessimiste
      [input.seanceId],
    );

    if (seanceRows.length === 0) {
      throw new SeanceNotFoundError(input.seanceId);
    }

    const placesRestantes: number = seanceRows[0].places_restantes;
    if (placesRestantes < 1) {
      throw new NoSeatsError(input.seanceId);
    }

    // ② INSERT reservation
    const [resResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO reservation (adherent_id, seance_id, statut)
       VALUES (?, ?, 'CONFIRMEE')`,
      [input.adherentId, input.seanceId],
    );
    const reservationId = resResult.insertId;

    // ③ UPDATE places restantes
    //   (on a le verrou → aucune concurrence possible à cet instant)
    await conn.execute(
      `UPDATE seance
          SET places_restantes = places_restantes - 1
        WHERE id = ?`,
      [input.seanceId],
    );

    // ④ INSERT paiement
    //   Si montantCents < 0, la contrainte CHECK de la table lève une erreur
    //   → withTransaction attrape → rollback → tout est annulé (atomicité ✓)
    await conn.execute(
      `INSERT INTO paiement (reservation_id, montant_cents, statut)
       VALUES (?, ?, 'EN_ATTENTE')`,
      [reservationId, input.montantCents],
    );

    // ⑤ Commit implicite à la sortie du callback withTransaction
    return {
      reservationId,
      statut: 'CONFIRMEE',
      paiementStatut: 'EN_ATTENTE',
      montantCents: input.montantCents,
    };
  });
}
