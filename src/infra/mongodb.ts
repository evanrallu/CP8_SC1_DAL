/**
 * CP8-SC1 — Connexion MongoDB sécurisée
 *
 * Validation de l'URI au démarrage, strictQuery activé,
 * listeners d'erreur pour le monitoring.
 *
 * Ref: slide 13 — Connexion MongoDB, code complet TypeScript
 */

import mongoose from "mongoose";
import "dotenv/config";

/**
 * Connecte Mongoose à MongoDB.
 * Crash immédiat si MONGO_URI manquant.
 */
export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI manquant dans .env");

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });

  mongoose.connection.on("error", (e) => {
    console.error("MongoDB error:", e);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("Mongo deconnecté");
  });
}
