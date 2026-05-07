# CinéClub Réunion — CP8 SC02 + SC03

API Node/TypeScript (Express + Zod) qui couvre :

- **SC02** — CRUD sécurisés sur **MySQL** (adhérents, films) et **MongoDB** (avis), avec validation Zod, DTO de sortie et 4 styles d'accès aux données (Repository / DAO / Active Record / Unit of Work).
- **SC03** — Réservations **transactionnelles** (verrouillage pessimiste *et* optimiste), **archivage** par procédure stockée et **audit** par trigger.

---

## Démarrage rapide

Pré-requis : Node 20+, Docker Desktop.

```bash
# 1. Dépendances
npm install

# 2. Configuration
cp .env.example .env
# (les valeurs par défaut fonctionnent avec docker-compose.yml)

# 3. Démarrage
npm run dev
```

Le script `predev` lance automatiquement `docker compose up -d --wait`, donc MySQL 8.4 et MongoDB 7 démarrent et sont *healthchecked* avant l'app. Les fichiers `docker/mysql/init/01_setup.sql` et `02_sc03.sql` sont rejoués au premier `up` (schéma + données + procédure + trigger).

API disponible sur http://localhost:3000 — health-check : `GET /health`.

### Commandes utiles

| Commande            | Effet |
|---------------------|-------|
| `npm run dev`       | App + Docker (hot-reload via ts-node-dev) |
| `npm run build`     | Compilation TypeScript dans `dist/` |
| `npm start`         | App en mode prod (Docker démarré via `prestart`) |
| `npm run db:up`     | Démarre les conteneurs |
| `npm run db:down`   | Stoppe les conteneurs |
| `npm run db:reset`  | **⚠ Supprime les volumes** puis relance (rejoue les SQL d'init) |
| `npm run db:logs`   | Logs Docker en streaming |

---

## Structure du projet

```
src/
├── config/env.ts                    Validation Zod des .env (crash fast)
├── domain/                          Interfaces + DTO + mappers
│   ├── Adherent.ts
│   ├── Avis.ts
│   ├── Film.ts
│   ├── Reservation.ts
│   └── Seance.ts
├── infra/                           Connexions + Repositories
│   ├── mysql.ts                     Pool + helper withTransaction()
│   ├── mongodb.ts
│   ├── AdherentRepositoryMySQL.ts
│   ├── AvisRepository.ts            Mongoose + lean + runValidators
│   ├── FilmRepository.ts            Interface
│   ├── FilmRepositoryMySQL.ts       Implémentation MySQL
│   └── FilmRepositoryMemory.ts      Implémentation in-memory (tests)
├── patterns/                        SC02 — 3 styles alternatifs au Repository
│   ├── AdherentDAO.ts               DAO (lignes brutes, snake_case)
│   ├── AdherentActiveRecord.ts      entité auto-persistée
│   └── UnitOfWork.ts                batch atomique tout-ou-rien
├── schemas/                         Zod (Create / Update / Search …)
│   ├── adherentSchemas.ts
│   ├── avisSchemas.ts
│   ├── filmSchemas.ts
│   └── reservationSchemas.ts
├── services/                        SC03
│   ├── ReservationService.ts        Pessimiste (SELECT … FOR UPDATE)
│   ├── ReservationServiceOpti.ts    Optimiste (colonne version)
│   └── archiveService.ts            Appel sp_archive_old_seances
├── controllers/
│   └── reservation.controller.ts    Retry exponentiel sur ConflictError
├── routes/
│   ├── adherents.ts
│   ├── avis.ts
│   ├── films.ts                     (module disponible — non monté)
│   ├── demo.ts                      (module disponible — non monté)
│   └── reservations.ts
└── index.ts                         Bootstrap (crash fast si BDD KO)

docker/mysql/init/                   Init MySQL rejoué au premier `up`
├── 01_setup.sql                     Schéma SC02 + seeds
└── 02_sc03.sql                      Schéma SC03 + procédure + trigger

db/migrations/006_seance_version.sql Ajout colonne `version` (verrou optimiste)

scripts/test-sc03.mjs                Tests fonctionnels SC03
```

> Les fichiers `src/routes/films.ts` et `src/routes/demo.ts` existent et sont prêts à être branchés (`app.use('/films', filmsRouter)` / `app.use('/demo', demoRouter)` dans `src/index.ts`) — pratique pour faire la démo des patterns SC02 sans toucher aux routes de référence.

---

## Endpoints exposés

### Adhérents — MySQL
| Méthode | Route | Description |
|--------|-------|------|
| GET | `/adherents` | Liste les adhérents actifs |
| GET | `/adherents/:id` | Détail |
| POST | `/adherents` | Crée |
| PUT | `/adherents/:id` | Met à jour |
| DELETE | `/adherents/:id` | Soft-delete (actif=0) |

### Avis — MongoDB
| Méthode | Route | Description |
|--------|-------|------|
| GET | `/avis/film/:filmId` | Avis publiés d'un film + note moyenne |
| GET | `/avis/adherent/:adherentId` | Avis d'un adhérent |
| GET | `/avis/:id` | Un avis par son `_id` |
| POST | `/avis` | Crée |
| PUT | `/avis/:id` | Met à jour |
| PATCH | `/avis/:id/moderation` | Change le statut (`publie` / `modere` / `masque`) |
| DELETE | `/avis/:id` | Supprime |

### Réservations — SC03
| Méthode | Route | Description |
|--------|-------|------|
| POST | `/reservations` | Réservation **pessimiste** (`SELECT … FOR UPDATE`) |
| POST | `/reservations/opti` | Réservation **optimiste** (`version`) + retry exponentiel (30 ms × n, jusqu'à 3 tentatives) |
| POST | `/reservations/archive` | Appelle la procédure `sp_archive_old_seances(?)` |

Codes d'erreur métier :
- `404` — séance introuvable
- `409` — plus de places (`NoSeatsError`) ou conflit persistant après retries (`ConflictError`)
- `400` — validation Zod

### Health
| Méthode | Route |
|--------|-------|
| GET | `/health` → `{ status, env, timestamp }` |

---

## Exemples (curl / PowerShell)

```bash
# Réservation transactionnelle
curl -X POST http://localhost:3000/reservations \
  -H "Content-Type: application/json" \
  -d '{"adherentId":1,"seanceId":2,"montantCents":1200}'

# Variante optimiste (retry automatique en cas de ConflictError)
curl -X POST http://localhost:3000/reservations/opti \
  -H "Content-Type: application/json" \
  -d '{"adherentId":1,"seanceId":2,"montantCents":1200}'

# Archivage des séances passées
curl -X POST http://localhost:3000/reservations/archive \
  -H "Content-Type: application/json" \
  -d '{"avantDate":"2026-01-01"}'

# Adhérent / Avis (SC02)
curl -X POST http://localhost:3000/adherents \
  -H "Content-Type: application/json" \
  -d '{"nom":"Dupont","prenom":"Marie","email":"marie@example.com","telephone":"0692123456"}'

curl -X POST http://localhost:3000/avis \
  -H "Content-Type: application/json" \
  -d '{"adherentId":1,"filmId":1,"note":4,"commentaire":"Très bon film !"}'
```

---

## Tests fonctionnels SC03

`scripts/test-sc03.mjs` ouvre une connexion MySQL, prend un *snapshot* avant/après et appelle l'API. Lance-les **avec l'app démarrée** (`npm run dev` dans un autre terminal).

| Script | Vérifie |
|--------|---------|
| `npm run test:rollback`   | FK invalide → la transaction rollback intégralement (places, reservation, paiement inchangés) |
| `npm run test:reserve`    | Réservation valide → `places_restantes -1`, `+1 reservation`, `+1 paiement` |
| `npm run test:concurrent` | 5 POST simultanés → pas de surbooking ni de double-décrément (`FOR UPDATE` sérialise) |
| `npm run test:archive`    | `sp_archive_old_seances` retourne un `nbArchivees` numérique |
| `npm run test:audit`      | `trg_paiement_audit_update` ignore les UPDATE *touch* et trace les vrais changements |
| `npm run test:cp8sc3`     | Enchaîne `rollback` + `archive` + `audit` (suite minimale d'évaluation) |

Chaque script `exit 0` si OK, `exit 1` sinon — utilisable en CI.

---

## Points clés (pour la soutenance)

- **Crash fast** — `src/config/env.ts` valide les variables avec Zod et `src/index.ts` connecte MySQL + Mongo *avant* `app.listen`. L'app ne démarre jamais dégradée.
- **Sécurité SQL** — `pool.execute(sql, params)` partout (requêtes paramétrées), DTO de sortie qui filtre les colonnes sensibles, soft-delete (`actif=0`).
- **Sécurité NoSQL** — Schémas Mongoose stricts + `runValidators: true` sur les `update`, `lean()` pour ne pas leak l'instance Mongoose.
- **Patterns d'accès** — Repository (référence) + DAO + Active Record + Unit of Work, tous sur la même entité Adhérent → comparaison directe en jury (voir `src/routes/demo.ts`).
- **Transactions SC03** — Helper `withTransaction(cb)` (`src/infra/mysql.ts`) qui `BEGIN` / `COMMIT` / `ROLLBACK` automatiquement, utilisé par les deux services de réservation.
- **Concurrence** — Verrouillage **pessimiste** (`SELECT … FOR UPDATE`) en service principal, **optimiste** (colonne `version` + `UPDATE … WHERE version=?`) avec retry exponentiel en bonus.
- **Procédure stockée** — `sp_archive_old_seances(IN avant_date DATE)` (voir `docker/mysql/init/02_sc03.sql`).
- **Trigger d'audit** — `trg_paiement_audit_update` n'écrit dans `audit_log` que sur changement réel (les UPDATE *touch* sont ignorés).
