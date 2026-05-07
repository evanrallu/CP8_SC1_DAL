/**
 * src/infra/FilmRepository.ts
 * Contrat du Repository Film.
 *
 * L'interface isole le code métier (routes) de l'implémentation BDD :
 * - FilmRepositoryMySQL pour la production
 * - FilmRepositoryMemory pour les tests sans MySQL
 */
import { Film } from '../domain/Film';
import { CreateFilmDTO, UpdateFilmDTO } from '../schemas/filmSchemas';

export interface FilmRepository {
  findAll(): Promise<Film[]>;
  findById(id: number): Promise<Film | null>;
  searchByTitle(q: string): Promise<Film[]>;
  create(data: CreateFilmDTO): Promise<Film>;
  update(id: number, data: UpdateFilmDTO): Promise<Film | null>;
  delete(id: number): Promise<boolean>;
}
