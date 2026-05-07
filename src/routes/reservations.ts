/**
 * src/routes/reservations.ts
 * Routes Express pour les réservations.
 *
 *  POST /reservations          → verrouillage pessimiste (FOR UPDATE)
 *  POST /reservations/opti     → verrouillage optimiste (colonne version) + retry
 *  POST /reservations/archive  → appel sp_archive_old_seances
 */
import { Router, Request, Response } from 'express';
import { postReservation, postReservationOpti } from '../controllers/reservation.controller';
import { archiveOldSeances } from '../services/archiveService';
import { ArchiveSeancesSchema } from '../schemas/reservationSchemas';

const router = Router();

// ─── POST /reservations ────────────────────────────────────────────────────
// Réservation transactionnelle (pessimiste — SELECT FOR UPDATE)
router.post('/', postReservation);

// ─── POST /reservations/opti ───────────────────────────────────────────────
// Réservation avec verrouillage optimiste + retry (bonus SC3)
router.post('/opti', postReservationOpti);

// ─── POST /reservations/archive ───────────────────────────────────────────
// Archivage des vieilles séances via procédure stockée
router.post('/archive', async (req: Request, res: Response) => {
  const parsed = ArchiveSeancesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const avantDate = new Date(parsed.data.avantDate);
  const nbArchivees = await archiveOldSeances(avantDate);

  res.json({
    message: `${nbArchivees} séance(s) archivée(s) avant le ${parsed.data.avantDate}`,
    nbArchivees,
  });
});

export default router;
