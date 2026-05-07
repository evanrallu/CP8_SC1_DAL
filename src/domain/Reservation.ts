/**
 * src/domain/Reservation.ts
 * Entités Reservation et Paiement.
 */

export type StatutReservation = 'CONFIRMEE' | 'ANNULEE' | 'EN_ATTENTE';
export type StatutPaiement    = 'EN_ATTENTE' | 'VALIDE' | 'REMBOURSE' | 'ECHEC';

export interface Reservation {
  id: number;
  adherentId: number;
  seanceId: number;
  statut: StatutReservation;
  createdAt: Date;
}

export interface Paiement {
  id: number;
  reservationId: number;
  montantCents: number;   // stocké en centimes pour éviter les flottants
  statut: StatutPaiement;
  createdAt: Date;
}

/** DTO retourné après une réservation réussie */
export interface ReservationResultDTO {
  reservationId: number;
  statut: StatutReservation;
  paiementStatut: StatutPaiement;
  montantCents: number;
}
