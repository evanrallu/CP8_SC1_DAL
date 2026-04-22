/**
 * CP8-SC1 — Bootstrap : crash fast, démarre clean
 *
 * 1. Vérifier les connexions AVANT d'exposer l'API
 * 2. Démarrer l'API seulement si tout est OK
 *
 * Ref: slide 14 — Démarrage de l'app
 */

import express from "express";
import { getPool, testConnection } from "./infra/mysql";
import { connectMongo } from "./infra/mongodb";

async function bootstrap() {
  // 1. Vérifier les connexions AVANT d'exposer l'API
  try {
    await testConnection();
    console.log("\u2713 MySQL OK");

    await connectMongo();
    console.log("\u2713 MongoDB OK");
  } catch (err) {
    console.error("\u2717 Impossible de connecter:", err);
    process.exit(1); // crash fast
  }

  // 2. Démarrer l'API seulement si tout est OK
  const app = express();
  app.get("/", (_, res) => res.json({ message: "API CineClub DAL" }));
  app.get("/health", (_, res) => res.json({ ok: true }));
  app.listen(3000, () => console.log("API sur :3000"));
}

bootstrap();
