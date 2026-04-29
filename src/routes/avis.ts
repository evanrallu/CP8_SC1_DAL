/**
 * src/routes/avis.ts
 * Routes Express pour l'entité Avis (CRUD NoSQL / MongoDB).
 *
 * Flux de chaque route :
 *   req.body → safeParse (Zod) → AvisRepository (Mongoose) → toAvisDTO (sortie filtrée)
 *
 * Sécurité NoSQL :
 *   - Zod z.string() rejette {"$ne": null} → anti-injection MongoDB operators
 *   - strict: true dans le schéma Mongoose ignore les champs inconnus
 */
import { Router, Request, Response } from 'express';
import { AvisRepository } from '../infra/AvisRepository';
import {
  CreateAvisSchema,
  UpdateAvisSchema,
  ModerationSchema,
} from '../schemas/avisSchemas';
import { toAvisDTO } from '../domain/Avis';

const router = Router();
const repo = new AvisRepository();

// ─── GET /avis/film/:filmId ────────────────────────────────────────────────
// Récupère tous les avis publiés d'un film + note moyenne
router.get('/film/:filmId', async (req: Request, res: Response) => {
  const filmId = parseInt(req.params.filmId, 10);
  if (isNaN(filmId)) {
    return res.status(400).json({ error: 'filmId doit être un entier' });
  }

  const [avis, moyenne] = await Promise.all([
    repo.findAllByFilm(filmId),
    repo.getAverageNote(filmId),
  ]);

  res.json({
    filmId,
    moyenne: moyenne !== null ? Math.round(moyenne * 10) / 10 : null,
    total: avis.length,
    avis: avis.map(a => toAvisDTO(a as any)),
  });
});

// ─── GET /avis/adherent/:adherentId ───────────────────────────────────────
// Récupère tous les avis d'un adhérent
router.get('/adherent/:adherentId', async (req: Request, res: Response) => {
  const adherentId = parseInt(req.params.adherentId, 10);
  if (isNaN(adherentId)) {
    return res.status(400).json({ error: 'adherentId doit être un entier' });
  }

  const avis = await repo.findAllByAdherent(adherentId);
  res.json(avis.map(a => toAvisDTO(a as any)));
});

// ─── GET /avis/:id ─────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  const avis = await repo.findById(req.params.id);
  if (!avis) {
    return res.status(404).json({ error: 'Avis introuvable' });
  }
  res.json(toAvisDTO(avis as any));
});

// ─── POST /avis ─────────────────────────────────────────────────────────────
// Crée un nouvel avis
router.post('/', async (req: Request, res: Response) => {
  // 1. Validation Zod — rejette les objets MongoDB injectés
  const parsed = CreateAvisSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  // 2. Création — le schéma Mongoose re-valide (note min/max, etc.)
  const avis = await repo.create(parsed.data);

  // 3. DTO de sortie (statut de modération masqué)
  res.status(201).json(toAvisDTO(avis as any));
});

// ─── PUT /avis/:id ─────────────────────────────────────────────────────────
// Met à jour un avis (note, commentaire, tags, photos)
router.put('/:id', async (req: Request, res: Response) => {
  const parsed = UpdateAvisSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  // findByIdAndUpdate avec runValidators:true → les règles min/max du schéma s'appliquent
  const avis = await repo.update(req.params.id, parsed.data);
  if (!avis) {
    return res.status(404).json({ error: 'Avis introuvable' });
  }

  res.json(toAvisDTO(avis as any));
});

// ─── PATCH /avis/:id/moderation ────────────────────────────────────────────
// Modération admin : publie / modere / masque
router.patch('/:id/moderation', async (req: Request, res: Response) => {
  const parsed = ModerationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Statut invalide',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const avis = await repo.moderate(req.params.id, parsed.data);
  if (!avis) {
    return res.status(404).json({ error: 'Avis introuvable' });
  }

  res.json({ message: `Avis passé en statut "${parsed.data.statut}"` });
});

// ─── DELETE /avis/:id ──────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  const supprimé = await repo.remove(req.params.id);
  if (!supprimé) {
    return res.status(404).json({ error: 'Avis introuvable' });
  }
  res.status(204).send();
});

export default router;
