/**
 * src/index.ts
 * Point d'entrée de l'application — pattern "crash fast".
 *
 * Principe : on connecte les BDD AVANT de démarrer le serveur.
 * Si une connexion échoue → process.exit(1) avec un message clair.
 * L'application ne démarre jamais dans un état instable.
 */
import express from 'express';
import { env } from './config/env';
import { testConnection } from './infra/mysql';
import { connectMongo } from './infra/mongodb';

// Import des routeurs
import adherentsRouter    from './routes/adherents';
import avisRouter         from './routes/avis';
import reservationsRouter from './routes/reservations';   // ← SC03

const app = express();

// ─── Middlewares globaux ────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/adherents',    adherentsRouter);
app.use('/avis',         avisRouter);
app.use('/reservations', reservationsRouter);  // ← SC03

// Route de santé
app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: env.NODE_ENV, timestamp: new Date().toISOString() });
});

// ─── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable` });
});

// ─── Gestionnaire d'erreurs global ─────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Erreur non gérée :', err);
  res.status(500).json({
    error: env.NODE_ENV === 'development' ? err.message : 'Erreur serveur interne',
  });
});

// ─── Démarrage ─────────────────────────────────────────────────────────────
async function bootstrap() {
  console.log('🚀 Démarrage de CinéClub Réunion API...');
  await testConnection();
  await connectMongo();
  app.listen(env.PORT, () => {
    console.log(`\n🎬 CinéClub Réunion API démarrée`);
    console.log(`   ➜ http://localhost:${env.PORT}`);
    console.log(`   ➜ http://localhost:${env.PORT}/health`);
    console.log(`   ➜ Environnement : ${env.NODE_ENV}\n`);
    console.log('   ─── Routes SC03 ───────────────────────────────');
    console.log(`   POST /reservations          (pessimiste FOR UPDATE)`);
    console.log(`   POST /reservations/opti     (optimiste version + retry)`);
    console.log(`   POST /reservations/archive  (procédure sp_archive_old_seances)`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Échec du démarrage :', err);
  process.exit(1);
});
