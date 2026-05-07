/**
 * src/schemas/filmSchemas.ts
 * Schémas Zod pour la validation des données Film.
 *
 * Règles :
 * - L'année doit être un entier entre 1888 (Roundhay Garden Scene) et 2030
 * - Le genre est limité à la liste fermée du domaine
 * - z.string() / z.number() rejettent automatiquement les objets injectés
 *   (protection contre l'injection NoSQL et les payloads mal typés)
 */
import { z } from 'zod';
import { GENRES_FILM } from '../domain/Film';

export const CreateFilmSchema = z.object({
  titre:        z.string().min(1, 'Le titre est obligatoire').max(200),
  realisateur:  z.string().min(1, 'Le réalisateur est obligatoire').max(120),
  annee:        z.number().int().min(1888, 'Année minimale : 1888').max(2030, 'Année maximale : 2030'),
  dureeMinutes: z.number().int().positive('La durée doit être positive').max(1000),
  genre:        z.enum(GENRES_FILM as unknown as [string, ...string[]]),
  resume:       z.string().max(5000).optional(),
});

export type CreateFilmDTO = z.infer<typeof CreateFilmSchema>;

// .partial() rend tous les champs optionnels — adapté à un PATCH
export const UpdateFilmSchema = CreateFilmSchema.partial();

export type UpdateFilmDTO = z.infer<typeof UpdateFilmSchema>;

// Schéma dédié à la recherche : refuse explicitement les objets / opérateurs injectés
export const SearchFilmSchema = z.object({
  q: z.string().min(1, 'Paramètre de recherche obligatoire').max(200),
});
