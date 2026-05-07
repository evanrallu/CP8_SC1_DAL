/**
 * src/routes/films.ts
 * Routes Express pour l'entité Film (CRUD SQL — exercice bonus CP8 SC02).
 *
 * Flux de chaque route :
 *   req.body → safeParse (Zod) → Repository (SQL) → toFilmDTO (sortie filtrée)
 *
 * Les routes ne dépendent QUE de l'interface FilmRepository — l'implémentation
 * concrète (MySQL ou Memory) est injectée à la construction.
 */
import { Router, Request, Response } from 'express';
import { FilmRepository } from '../infra/FilmRepository';
import { FilmRepositoryMySQL } from '../infra/FilmRepositoryMySQL';
import {
  CreateFilmSchema,
  UpdateFilmSchema,
  SearchFilmSchema,
} from '../schemas/filmSchemas';
import { toFilmDTO } from '../domain/Film';

export function buildFilmsRouter(repo: FilmRepository): Router {
  const router = Router();

  // ─── GET /films ──────────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response) => {
    const films = await repo.findAll();
    res.json(films.map(toFilmDTO));
  });

  // ─── GET /films/search?q=... ─────────────────────────────────────────────
  // Doit être déclarée AVANT /:id pour que "search" ne soit pas interprété
  // comme un id.
  router.get('/search', async (req: Request, res: Response) => {
    const parsed = SearchFilmSchema.safeParse({ q: req.query.q });
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Paramètre de recherche invalide',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const films = await repo.searchByTitle(parsed.data.q);
    res.json(films.map(toFilmDTO));
  });

  // ─── GET /films/:id ──────────────────────────────────────────────────────
  router.get('/:id', async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'L\'id doit être un nombre entier' });
    }

    const film = await repo.findById(id);
    if (!film) {
      return res.status(404).json({ error: 'Film introuvable' });
    }
    res.json(toFilmDTO(film));
  });

  // ─── POST /films ─────────────────────────────────────────────────────────
  router.post('/', async (req: Request, res: Response) => {
    const parsed = CreateFilmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Données invalides',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const film = await repo.create(parsed.data);
    res.status(201).json(toFilmDTO(film));
  });

  // ─── PUT /films/:id ──────────────────────────────────────────────────────
  router.put('/:id', async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'L\'id doit être un nombre entier' });
    }

    const parsed = UpdateFilmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Données invalides',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const film = await repo.update(id, parsed.data);
    if (!film) {
      return res.status(404).json({ error: 'Film introuvable' });
    }
    res.json(toFilmDTO(film));
  });

  // ─── DELETE /films/:id ───────────────────────────────────────────────────
  router.delete('/:id', async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'L\'id doit être un nombre entier' });
    }

    const supprime = await repo.delete(id);
    if (!supprime) {
      return res.status(404).json({ error: 'Film introuvable' });
    }
    res.status(204).send();
  });

  return router;
}

// Routeur par défaut, branché sur l'implémentation MySQL
export default buildFilmsRouter(new FilmRepositoryMySQL());
