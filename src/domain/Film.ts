/**
 * src/domain/Film.ts
 * Interface métier Film — indépendante de la BDD.
 *
 * Le DTO de sortie filtre `createdAt` (champ technique) conformément au
 * critère d'évaluation de l'exercice bonus.
 */

export type GenreFilm = 'drame' | 'comedie' | 'thriller' | 'documentaire' | 'animation';

export const GENRES_FILM: readonly GenreFilm[] = [
  'drame', 'comedie', 'thriller', 'documentaire', 'animation',
] as const;

export interface Film {
  id: number;
  titre: string;
  realisateur: string;
  annee: number;
  dureeMinutes: number;
  genre: GenreFilm;
  resume: string | null;
  createdAt: Date;
}

export interface FilmDTO {
  id: number;
  titre: string;
  realisateur: string;
  annee: number;
  dureeMinutes: number;
  genre: GenreFilm;
  resume: string | null;
}

export function toFilmDTO(f: Film): FilmDTO {
  return {
    id:           f.id,
    titre:        f.titre,
    realisateur:  f.realisateur,
    annee:        f.annee,
    dureeMinutes: f.dureeMinutes,
    genre:        f.genre,
    resume:       f.resume,
  };
  // ↑ createdAt (champ technique) volontairement absent du DTO
}
