/**
 * src/routes/demo.ts
 * Routes de démonstration des 3 patterns alternatifs au Repository :
 *   /demo/dao/...           → DAO            (lignes brutes, snake_case)
 *   /demo/active-record/... → Active Record  (entité auto-persistée)
 *   /demo/uow/...           → Unit of Work   (batch atomique tout-ou-rien)
 *
 * Objectif : permettre au jury de comparer en live les 4 styles d'accès aux
 * données sur la même entité (Adhérent), sans toucher aux routes /adherents
 * qui restent l'implémentation Repository de référence.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AdherentDAO } from '../patterns/AdherentDAO';
import { AdherentAR } from '../patterns/AdherentActiveRecord';
import { UnitOfWork } from '../patterns/UnitOfWork';
import { CreateAdherentSchema, UpdateAdherentSchema } from '../schemas/adherentSchemas';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
//  DAO — renvoie volontairement la ligne BRUTE (snake_case, actif: 0/1)
//  pour que le jury voie le contraste avec le DTO sortant du Repository.
// ═══════════════════════════════════════════════════════════════════════════

const dao = new AdherentDAO();

router.get('/dao/adherents/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id invalide' });

  const row = await dao.selectById(id);
  if (!row) return res.status(404).json({ error: 'introuvable' });

  res.json({ pattern: 'DAO', row });
});

router.post('/dao/adherents', async (req: Request, res: Response) => {
  const parsed = CreateAdherentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const id = await dao.insertRow({
    nom:       parsed.data.nom,
    prenom:    parsed.data.prenom,
    email:     parsed.data.email,
    telephone: parsed.data.telephone ?? null,
    actif:     1,
  });
  const row = await dao.selectById(id);
  res.status(201).json({ pattern: 'DAO', row });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ACTIVE RECORD — l'entité elle-même porte save() / deactivate() / delete().
// ═══════════════════════════════════════════════════════════════════════════

router.get('/active-record/adherents/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id invalide' });

  const adherent = await AdherentAR.findById(id);
  if (!adherent) return res.status(404).json({ error: 'introuvable' });

  res.json({ pattern: 'Active Record', adherent });
});

router.post('/active-record/adherents', async (req: Request, res: Response) => {
  const parsed = CreateAdherentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.flatten().fieldErrors,
    });
  }
  // Marque distinctive : on appelle .save() sur l'entité, pas sur un repo.
  const adherent = new AdherentAR({
    nom:       parsed.data.nom,
    prenom:    parsed.data.prenom,
    email:     parsed.data.email,
    telephone: parsed.data.telephone ?? null,
  });
  await adherent.save();

  res.status(201).json({ pattern: 'Active Record', adherent });
});

router.put('/active-record/adherents/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id invalide' });

  const parsed = UpdateAdherentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const adherent = await AdherentAR.findById(id);
  if (!adherent) return res.status(404).json({ error: 'introuvable' });

  // Mutation directe de l'instance, puis save() — workflow Active Record canonique.
  if (parsed.data.nom       !== undefined) adherent.nom       = parsed.data.nom;
  if (parsed.data.prenom    !== undefined) adherent.prenom    = parsed.data.prenom;
  if (parsed.data.email     !== undefined) adherent.email     = parsed.data.email;
  if (parsed.data.telephone !== undefined) adherent.telephone = parsed.data.telephone ?? null;

  await adherent.save();

  res.json({ pattern: 'Active Record', adherent });
});

router.delete('/active-record/adherents/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id invalide' });

  const adherent = await AdherentAR.findById(id);
  if (!adherent) return res.status(404).json({ error: 'introuvable' });

  await adherent.deactivate();
  res.status(204).send();
});

// ═══════════════════════════════════════════════════════════════════════════
//  UNIT OF WORK — batch d'inscriptions atomique : tout ou rien.
// ═══════════════════════════════════════════════════════════════════════════

const BatchInscriptionSchema = z.array(CreateAdherentSchema).min(1).max(50);

router.post('/uow/inscription-batch', async (req: Request, res: Response) => {
  const parsed = BatchInscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Batch invalide',
      details: parsed.error.flatten(),
    });
  }

  const uow = new UnitOfWork();
  for (const data of parsed.data) {
    uow.registerNewAdherent({
      nom:       data.nom,
      prenom:    data.prenom,
      email:     data.email,
      telephone: data.telephone ?? null,
      actif:     1,
    });
  }

  try {
    const { insertedIds } = await uow.commit();
    res.status(201).json({
      pattern: 'Unit of Work',
      count: insertedIds.length,
      insertedIds,
    });
  } catch (err) {
    // Si UN SEUL email est en doublon, TOUS les inserts du batch sont rollback.
    // C'est la garantie d'atomicité du UoW.
    const code = (err as { code?: string }).code;
    if (code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        pattern: 'Unit of Work',
        error: 'Au moins un email est déjà utilisé — batch annulé (rollback complet)',
      });
    }
    throw err;
  }
});

export default router;
