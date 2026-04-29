/**
 * src/domain/Avis.ts
 * Interface métier Avis (document MongoDB).
 */
export interface Avis {
  _id: string;
  adherentId: number;
  filmId: number;
  note: number;           // 0 à 5
  commentaire?: string;
  tags?: string[];
  photos?: Array<{ url: string; legende?: string }>;
  statut: 'publie' | 'modere' | 'masque';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO de sortie Avis — on masque le statut de modération
 * pour les réponses publiques.
 */
export interface AvisDTO {
  id: string;
  adherentId: number;
  filmId: number;
  note: number;
  commentaire?: string;
  tags?: string[];
  photos?: Array<{ url: string; legende?: string }>;
  createdAt: Date;
}

export function toAvisDTO(a: Avis): AvisDTO {
  return {
    id:          a._id,
    adherentId:  a.adherentId,
    filmId:      a.filmId,
    note:        a.note,
    commentaire: a.commentaire,
    tags:        a.tags,
    photos:      a.photos,
    createdAt:   a.createdAt,
  };
  // ↑ statut interne (moderation) non exposé
}
