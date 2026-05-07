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
import adherentsRouter from './routes/adherents';
import avisRouter from './routes/avis';
import filmsRouter from './routes/films';
import demoRouter from './routes/demo';

const app = express();

// ─── Middlewares globaux ────────────────────────────────────────────────────
app.use(express.json());               // parse le body JSON
app.use(express.urlencoded({ extended: false }));

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/adherents', adherentsRouter);
app.use('/avis', avisRouter);
app.use('/films', filmsRouter);
app.use('/demo', demoRouter);   // Démo des patterns DAO / Active Record / Unit of Work

// Route de santé — utile pour vérifier que le serveur répond
app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: env.NODE_ENV, timestamp: new Date().toISOString() });
});

// ─── Gestion des routes inconnues ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable` });
});

// ─── Gestionnaire d'erreurs global ─────────────────────────────────────────
// Capture toutes les erreurs non gérées dans les routes async
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Erreur non gérée :', err);
  res.status(500).json({
    error: env.NODE_ENV === 'development' ? err.message : 'Erreur serveur interne',
  });
});

// ─── Démarrage ─────────────────────────────────────────────────────────────
async function bootstrap() {
  console.log('🚀 Démarrage de CinéClub Réunion API...');

  // Connexions BDD obligatoires avant d'accepter du trafic
  await testConnection();   // MySQL — crash si injoignable
  await connectMongo();     // MongoDB — crash si injoignable

  // Le serveur écoute seulement si les deux BDD sont prêtes
  app.listen(env.PORT, () => {
    console.log(`\n🎬 CinéClub Réunion API démarrée`);
    console.log(`   ➜ http://localhost:${env.PORT}`);
    console.log(`   ➜ http://localhost:${env.PORT}/health`);
    console.log(`   ➜ Environnement : ${env.NODE_ENV}\n`);
  });
}

// Lance le bootstrap et attrape les erreurs fatales
bootstrap().catch((err) => {
  console.error('❌ Échec du démarrage :', err);
  process.exit(1);
});
