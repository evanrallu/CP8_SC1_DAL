/**
 * src/controllers/reservation.controller.ts
 * Contrôleur Express pour les réservations.
 *
 * Expose deux fonctions :
 *  - postReservation       : verrouillage pessimiste (ReservationService)
 *  - postReservationOpti   : verrouillage optimiste avec retry (ReservationServiceOpti)
 *
 * Pattern retry (optimiste) :
 *  On retente jusqu'à MAX_RETRIES fois si ConflictError.
 *  Délai exponentiel : 30ms × attempt (30ms, 60ms, 90ms).
 *  Après MAX_RETRIES échecs → HTTP 409.
 */
import { Request, Response, NextFunction } from 'express';
import { CreateReservationSchema } from '../schemas/reservationSchemas';
import { reserver, SeanceNotFoundError, NoSeatsError } from '../services/ReservationService';
import {
  reserverOpti,
  ConflictError,
  SeanceNotFoundError as SeanceNotFoundErrorOpti,
  NoSeatsError as NoSeatsErrorOpti,
} from '../services/ReservationServiceOpti';

// ─── Pessimiste (Livrable 1) ───────────────────────────────────────────────

export async function postReservation(req: Request, res: Response, next: NextFunction) {
  const parsed = CreateReservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await reserver(parsed.data);
    return res.status(201).json(result);

  } catch (e) {
    if (e instanceof SeanceNotFoundError) {
      return res.status(404).json({ error: e.message });
    }
    if (e instanceof NoSeatsError) {
      return res.status(409).json({ error: e.message });
    }
    // erreur inattendue → gestionnaire global Express (next, pas throw, sinon
    // unhandled promise rejection → crash du process en Express 4)
    return next(e);
  }
}

// ─── Optimiste avec retry (Bonus) ─────────────────────────────────────────

const MAX_RETRIES   = 3;
const RETRY_DELAY   = 30; // ms

export async function postReservationOpti(req: Request, res: Response, next: NextFunction) {
  const parsed = CreateReservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await reserverOpti(parsed.data);
      return res.status(201).json(result);

    } catch (e) {
      // ConflictError → retry avec délai exponentiel
      if (e instanceof ConflictError && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
        continue;
      }

      if (e instanceof ConflictError) {
        // Toutes les tentatives épuisées
        return res.status(409).json({
          error: 'Conflit persistant après plusieurs tentatives, réessayez',
        });
      }
      if (e instanceof SeanceNotFoundErrorOpti) {
        return res.status(404).json({ error: e.message });
      }
      if (e instanceof NoSeatsErrorOpti) {
        return res.status(409).json({ error: e.message });
      }
      return next(e);
    }
  }
}
