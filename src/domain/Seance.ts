/**
 * src/domain/Seance.ts
 * Entité Séance — indépendante de la BDD.
 */
export interface Seance {
  id: number;
  filmId: number;
  dateSeance: Date;
  placesTotales: number;
  placesRestantes: number;
  version: number;  // colonne de verrouillage optimiste (bonus SC3)
}

export interface SeanceDTO {
  id: number;
  filmId: number;
  dateSeance: Date;
  placesTotales: number;
  placesRestantes: number;
}

export function toSeanceDTO(s: Seance): SeanceDTO {
  return {
    id: s.id,
    filmId: s.filmId,
    dateSeance: s.dateSeance,
    placesTotales: s.placesTotales,
    placesRestantes: s.placesRestantes,
    // version est interne — non exposé au client
  };
}
