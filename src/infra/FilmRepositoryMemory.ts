/**
 * src/infra/FilmRepositoryMemory.ts
 * Implémentation en mémoire du FilmRepository (Map).
 *
 * Pourquoi ? Permet de tester les routes Express sans MySQL — l'un des
 * critères d'évaluation de l'exercice bonus.
 *
 * Le contrat est strictement identique à FilmRepositoryMySQL :
 * les routes ne savent pas quelle implémentation elles utilisent.
 */
import { Film } from '../domain/Film';
import { FilmRepository } from './FilmRepository';
import { CreateFilmDTO, UpdateFilmDTO } from '../schemas/filmSchemas';

export class FilmRepositoryMemory implements FilmRepository {
  private store = new Map<number, Film>();
  private nextId = 1;

  async findAll(): Promise<Film[]> {
    return [...this.store.values()].sort((a, b) =>
      b.annee - a.annee || a.titre.localeCompare(b.titre),
    );
  }

  async findById(id: number): Promise<Film | null> {
    return this.store.get(id) ?? null;
  }

  async searchByTitle(q: string): Promise<Film[]> {
    // Recherche insensible à la casse, sans interprétation de wildcards
    const needle = q.toLowerCase();
    return [...this.store.values()]
      .filter(f => f.titre.toLowerCase().includes(needle))
      .sort((a, b) => b.annee - a.annee || a.titre.localeCompare(b.titre));
  }

  async create(data: CreateFilmDTO): Promise<Film> {
    const id = this.nextId++;
    const film: Film = {
      id,
      titre:        data.titre,
      realisateur:  data.realisateur,
      annee:        data.annee,
      dureeMinutes: data.dureeMinutes,
      genre:        data.genre as Film['genre'],
      resume:       data.resume ?? null,
      createdAt:    new Date(),
    };
    this.store.set(id, film);
    return film;
  }

  async update(id: number, data: UpdateFilmDTO): Promise<Film | null> {
    const existing = this.store.get(id);
    if (!existing) return null;

    const updated: Film = {
      ...existing,
      ...(data.titre        !== undefined && { titre:        data.titre }),
      ...(data.realisateur  !== undefined && { realisateur:  data.realisateur }),
      ...(data.annee        !== undefined && { annee:        data.annee }),
      ...(data.dureeMinutes !== undefined && { dureeMinutes: data.dureeMinutes }),
      ...(data.genre        !== undefined && { genre:        data.genre as Film['genre'] }),
      ...(data.resume       !== undefined && { resume:       data.resume ?? null }),
    };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: number): Promise<boolean> {
    return this.store.delete(id);
  }
}
