/**
 * src/config/env.ts
 * Validation des variables d'environnement avec Zod.
 * Principe "crash fast" : si une variable manque au démarrage,
 * l'application s'arrête immédiatement avec un message clair.
 */
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  // MySQL
  MYSQL_HOST:       z.string().min(1),
  MYSQL_PORT:       z.coerce.number().default(3306),
  MYSQL_DATABASE:   z.string().min(1),
  MYSQL_USER:       z.string().min(1),
  MYSQL_PASSWORD:   z.string().min(1),
  MYSQL_POOL_LIMIT: z.coerce.number().default(10),

  // MongoDB
  MONGO_URI: z.string().url(),

  // Serveur
  PORT:     z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// parse() lève une exception si invalide → crash fast voulu ici
const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables d\'environnement manquantes ou invalides :');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
