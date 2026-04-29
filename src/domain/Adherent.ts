/**
 * src/domain/Adherent.ts
 * Interface métier Adherent — indépendante de la BDD.
 * Représente l'entité telle que l'application la manipule (camelCase, boolean).
 */
export interface Adherent {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  actif: boolean;
  dateInscription: Date;
}

/**
 * DTO de sortie — ce que l'API renvoie au client.
 * On ne renvoie JAMAIS : actif, passwordHash, remember_token...
 */
export interface AdherentDTO {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  dateInscription: Date;
}

/** Convertit une entité interne en DTO sécurisé pour l'API */
export function toAdherentDTO(a: Adherent): AdherentDTO {
  return {
    id:              a.id,
    nom:             a.nom,
    prenom:          a.prenom,
    email:           a.email,
    telephone:       a.telephone,
    dateInscription: a.dateInscription,
  };
  // ↑ actif (flag interne) est volontairement absent du DTO de sortie
}
