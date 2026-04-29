/**
 * src/infra/mongodb.ts
 * Connexion MongoDB via Mongoose.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';

export async function connectMongo(): Promise<void> {
  // Événements de connexion — utiles pour les logs / supervision
  mongoose.connection.on('connected',    () => console.log('✅ MongoDB connecté'));
  mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB déconnecté'));
  mongoose.connection.on('error',        (err) => console.error('❌ MongoDB erreur :', err));

  await mongoose.connect(env.MONGO_URI);
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
  console.log('🔌 MongoDB déconnecté proprement');
}
