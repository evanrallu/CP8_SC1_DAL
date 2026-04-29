/**
 * src/routes/adherents.ts
 * Routes Express pour l'entité Adhérent (CRUD SQL).
 *
 * Flux de chaque route :
 *   req.body → safeParse (Zod) → Repository (SQL) → toAdherentDTO (sortie filtrée)
 *
 * Gestion des erreurs SQL :
 *   ER_DUP_ENTRY          → 409 Conflict (email déjà utilisé)
 *   ER_NO_REFERENCED_ROW_2 → 400 Bad Request (FK inexistante)
 */
import { Router, Request, Response } from 'express';
import { AdherentRepositoryMySQL } from '../infra/AdherentRepositoryMySQL';
import { CreateAdherentSchema, UpdateAdherentSchema } from '../schemas/adherentSchemas';
import { toAdherentDTO } from '../domain/Adherent';

const router = Router();
const repo = new AdherentRepositoryMySQL();

// ─── GET /adherents ────────────────────────────────────────────────────────
// Récupère tous les adhérents actifs
router.get('/', async (req: Request, res: Response) => {
  const adherents = await repo.findAll();
  res.json(adherents.map(toAdherentDTO));
});

// ─── GET /adherents/:id ────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'L\'id doit être un nombre entier' });
  }

  const adherent = await repo.findById(id);
  if (!adherent) {
    return res.status(404).json({ error: 'Adhérent introuvable' });
  }

  res.json(toAdherentDTO(adherent));
});

// ─── POST /adherents ───────────────────────────────────────────────────────
// Crée un nouvel adhérent
router.post('/', async (req: Request, res: Response) => {
  // 1. Validation Zod — safeParse ne lève pas d'exception
  const parsed = CreateAdherentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.flatten().fieldErrors, // erreurs par champ
    });
  }

  // 2. Vérification doublon email
  const existant = await repo.findByEmail(parsed.data.email);
  if (existant) {
    return res.status(409).json({ error: 'Cet email est déjà utilisé' });
  }

  // 3. Création + lecture après écriture (read-after-write)
  const adherent = await repo.create(parsed.data);

  // 4. DTO de sortie — champs internes filtrés
  res.status(201).json(toAdherentDTO(adherent));
});

// ─── PUT /adherents/:id ────────────────────────────────────────────────────
// Met à jour un adhérent (PATCH sémantique : seuls les champs fournis sont modifiés)
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'L\'id doit être un nombre entier' });
  }

  const parsed = UpdateAdherentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const adherent = await repo.update(id, parsed.data);
  if (!adherent) {
    return res.status(404).json({ error: 'Adhérent introuvable' });
  }

  res.json(toAdherentDTO(adherent));
});

// ─── DELETE /adherents/:id ─────────────────────────────────────────────────
// Désactive l'adhérent (soft delete — préserve l'historique)
router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'L\'id doit être un nombre entier' });
  }

  const desactivé = await repo.deactivate(id);
  if (!desactivé) {
    return res.status(404).json({ error: 'Adhérent introuvable' });
  }

  res.status(204).send(); // 204 No Content = succès sans corps de réponse
});

export default router;
