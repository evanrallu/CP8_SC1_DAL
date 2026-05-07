/**
 * src/schemas/reservationSchemas.ts
 * Validation Zod pour les réservations.
 */
import { z } from 'zod';

export const CreateReservationSchema = z.object({
  adherentId:   z.number().int().positive(),
  seanceId:     z.number().int().positive(),
  montantCents: z.number().int().min(0, 'Le montant ne peut pas être négatif'),
});

export type CreateReservationDTO = z.infer<typeof CreateReservationSchema>;

/**
 * Schéma pour l'archivage — reçoit une date ISO string, convertie en Date.
 */
export const ArchiveSeancesSchema = z.object({
  avantDate: z.string().date('Format attendu : YYYY-MM-DD'),
});
