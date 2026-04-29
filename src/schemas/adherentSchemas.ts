/**
 * src/schemas/adherentSchemas.ts
 * Schémas Zod pour la validation des données Adhérent.
 *
 * Pourquoi Zod ?
 * - Valide les données en entrée (req.body) avant tout traitement
 * - Génère automatiquement les types TypeScript via z.infer<>
 * - Protège contre l'injection SQL et NoSQL en rejetant les types inattendus
 */
import { z } from 'zod';

// ─── Schéma de création ────────────────────────────────────────────────────
export const CreateAdherentSchema = z.object({
  nom:       z.string().min(1, 'Le nom est obligatoire').max(80),
  prenom:    z.string().min(1, 'Le prénom est obligatoire').max(80),
  email:     z.string().email('Email invalide').max(160),
  telephone: z.string().regex(/^0[1-9]\d{8}$/, 'Téléphone invalide (ex: 0692123456)').optional(),
});

// Type TypeScript dérivé automatiquement du schéma — pas de duplication !
export type CreateAdherentDTO = z.infer<typeof CreateAdherentSchema>;

// ─── Schéma de mise à jour ─────────────────────────────────────────────────
// .partial() rend tous les champs optionnels → parfait pour PATCH/PUT partiel
export const UpdateAdherentSchema = CreateAdherentSchema.partial();

export type UpdateAdherentDTO = z.infer<typeof UpdateAdherentSchema>;
