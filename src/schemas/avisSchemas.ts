/**
 * src/schemas/avisSchemas.ts
 * Schémas Zod pour la validation des Avis (MongoDB).
 *
 * Point sécurité clé : z.string() sur les champs texte rejette
 * automatiquement les objets MongoDB comme {"$ne": null}
 * → protection anti-injection NoSQL.
 */
import { z } from 'zod';

// Sous-schéma pour les photos
const PhotoSchema = z.object({
  url:     z.string().url('URL de photo invalide'),
  legende: z.string().max(200).optional(),
});

// ─── Schéma de création ────────────────────────────────────────────────────
export const CreateAvisSchema = z.object({
  adherentId:  z.number().int().positive('adherentId doit être un entier positif'),
  filmId:      z.number().int().positive('filmId doit être un entier positif'),
  note:        z.number().min(0, 'Note minimum : 0').max(5, 'Note maximum : 5'),
  commentaire: z.string().max(2000).optional(),
  tags:        z.array(z.string().max(30)).max(10).optional(),
  photos:      z.array(PhotoSchema).max(5).optional(),
  // statut géré par l'admin uniquement, pas en création
});

export type CreateAvisDTO = z.infer<typeof CreateAvisSchema>;

// ─── Schéma de mise à jour ─────────────────────────────────────────────────
export const UpdateAvisSchema = CreateAvisSchema
  .omit({ adherentId: true, filmId: true })  // on ne change pas l'auteur ni le film
  .partial();

export type UpdateAvisDTO = z.infer<typeof UpdateAvisSchema>;

// ─── Schéma de modération (admin) ─────────────────────────────────────────
export const ModerationSchema = z.object({
  statut: z.enum(['publie', 'modere', 'masque']),
});

export type ModerationDTO = z.infer<typeof ModerationSchema>;
