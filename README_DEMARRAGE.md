# CinéClub Réunion — CP8 SC02 : CRUD Sécurisé SQL + NoSQL

API Express en TypeScript exposant un CRUD sur deux bases :
- **MySQL** (adhérents) — requêtes paramétrées + soft delete
- **MongoDB** (avis) — Mongoose + Zod en garde-fou anti-injection

---

## Prérequis

| Outil | Rôle | Vérification |
|-------|------|--------------|
| Node.js ≥ 18 | runtime de l'API | `node --version` |
| **MySQL 8** (local OU Docker) | BDD adhérents | voir section *Démarrage* |
| **MongoDB** (service local OU Docker) | BDD avis | `Get-Service MongoDB` |

> ⚠️ Sous Windows, `mysql` n'est pas reconnu ? C'est normal s'il n'est pas installé / pas dans le PATH. Utilise Docker (méthode A ci-dessous) — c'est le plus simple.

---

## Démarrage

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configurer `.env`

```bash
cp .env.example .env
```

Le fichier par défaut suffit pour un poste local :

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=cineclub_reunion
MYSQL_USER=cineclub_user
MYSQL_PASSWORD=motdepasse_fort_ici
MYSQL_POOL_LIMIT=10

MONGO_URI=mongodb://localhost:27017/cineclub_reunion

PORT=3000
NODE_ENV=development
```

### 3. Lancer MySQL (choisir A ou B)

#### Méthode A — Docker (recommandée sous Windows)

Le script `sql_setup.sql` est monté en `init` : la base, les tables, le compte applicatif et les données de test sont créés automatiquement au premier démarrage.

```bash
docker run -d --name cineclub-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpw \
  -e MYSQL_DATABASE=cineclub_reunion \
  -p 3306:3306 \
  -v "$(pwd)/sql_setup.sql:/docker-entrypoint-initdb.d/01-setup.sql:ro" \
  mysql:8.4
```

PowerShell (Windows) — remplacer `$(pwd)` par le chemin absolu :

```powershell
docker run -d --name cineclub-mysql `
  -e MYSQL_ROOT_PASSWORD=rootpw `
  -e MYSQL_DATABASE=cineclub_reunion `
  -p 3306:3306 `
  -v "C:/Users/evans/Downloads/cp8-sc02-exercice/sql_setup.sql:/docker-entrypoint-initdb.d/01-setup.sql:ro" `
  mysql:8.4
```

Comme l'app se connecte depuis l'hôte (le trafic arrive sur l'IP du bridge Docker, pas `localhost`), il faut autoriser l'utilisateur applicatif depuis n'importe quel host :

```bash
docker exec cineclub-mysql mysql -uroot -prootpw -e "
CREATE USER IF NOT EXISTS 'cineclub_user'@'%' IDENTIFIED BY 'motdepasse_fort_ici';
GRANT SELECT, INSERT, UPDATE, DELETE ON cineclub_reunion.* TO 'cineclub_user'@'%';
FLUSH PRIVILEGES;"
```

#### Méthode B — MySQL installé localement

```bash
mysql -u root -p < sql_setup.sql
```

### 4. Lancer MongoDB

- **Service Windows** : déjà installé ? `Get-Service MongoDB` doit afficher `Running`.
- **Sinon (Docker)** :

  ```bash
  docker run -d --name cineclub-mongo -p 27017:27017 mongo:7
  ```

### 5. Lancer l'API

```bash
npm run dev
```

Sortie attendue :

```
🚀 Démarrage de CinéClub Réunion API...
✅ MySQL connecté
✅ MongoDB connecté

🎬 CinéClub Réunion API démarrée
   ➜ http://localhost:3000
   ➜ http://localhost:3000/health
```

---

## Vérification rapide

```bash
curl http://localhost:3000/health
curl http://localhost:3000/adherents
curl http://localhost:3000/avis/film/1
```

> Ouvrir http://localhost:3000 directement renvoie `{"error":"Route GET / introuvable"}` — c'est **normal**, la racine n'est pas une route exposée. Le 404 prouve que le serveur répond.

---

## Structure du projet

```
src/
├── config/
│   └── env.ts                      ← Validation des .env avec Zod (crash fast)
├── domain/
│   ├── Adherent.ts                 ← Interface + DTO + mapper de sortie
│   └── Avis.ts                     ← Interface + DTO + mapper de sortie
├── infra/
│   ├── mysql.ts                    ← Pool MySQL singleton + helper transaction
│   ├── mongodb.ts                  ← Connexion Mongoose
│   ├── AdherentRepositoryMySQL.ts  ← CRUD SQL sécurisé (execute + ?)
│   └── AvisRepository.ts           ← CRUD NoSQL (Mongoose + lean + runValidators)
├── schemas/
│   ├── adherentSchemas.ts          ← Zod : Create/Update Adherent
│   └── avisSchemas.ts              ← Zod : Create/Update/Moderation Avis
├── routes/
│   ├── adherents.ts                ← Routes Express /adherents
│   └── avis.ts                     ← Routes Express /avis
└── index.ts                        ← Bootstrap (crash fast si BDD injoignable)
```

---

## Endpoints

### Adhérents (MySQL)

| Méthode | Route | Description | Code succès |
|---------|-------|-------------|-------------|
| GET | `/adherents` | Liste les adhérents actifs | 200 |
| GET | `/adherents/:id` | Récupère un adhérent | 200 |
| POST | `/adherents` | Crée un adhérent | 201 |
| PUT | `/adherents/:id` | Met à jour (champs partiels acceptés) | 200 |
| DELETE | `/adherents/:id` | Soft delete (`actif = 0`) | 204 |

### Avis (MongoDB)

| Méthode | Route | Description | Code succès |
|---------|-------|-------------|-------------|
| GET | `/avis/film/:filmId` | Avis publiés + note moyenne | 200 |
| GET | `/avis/adherent/:adherentId` | Avis d'un adhérent | 200 |
| GET | `/avis/:id` | Avis par ObjectId Mongo | 200 |
| POST | `/avis` | Crée un avis | 201 |
| PUT | `/avis/:id` | Met à jour un avis | 200 |
| PATCH | `/avis/:id/moderation` | Change le statut (`publié` / `modéré` / `masqué`) | 200 |
| DELETE | `/avis/:id` | Supprime l'avis | 204 |

### Codes d'erreur typiques

| Code | Cause |
|------|-------|
| 400 | Body invalide (Zod), id non numérique |
| 404 | Ressource introuvable |
| 409 | Doublon email (POST /adherents) |
| 500 | Erreur serveur non gérée |

---

## Exemples de requêtes

```bash
# Créer un adhérent
curl -X POST http://localhost:3000/adherents \
  -H "Content-Type: application/json" \
  -d '{"nom":"Dupont","prenom":"Marie","email":"marie@example.com","telephone":"0692123456"}'

# Mettre à jour un adhérent
curl -X PUT http://localhost:3000/adherents/1 \
  -H "Content-Type: application/json" \
  -d '{"telephone":"0693000000"}'

# Désactiver un adhérent
curl -X DELETE http://localhost:3000/adherents/1

# Créer un avis
curl -X POST http://localhost:3000/avis \
  -H "Content-Type: application/json" \
  -d '{"adherentId":1,"filmId":1,"note":4,"commentaire":"Très bon film !"}'

# Modérer un avis
curl -X PATCH http://localhost:3000/avis/<MONGO_ID>/moderation \
  -H "Content-Type: application/json" \
  -d '{"statut":"masqué"}'

# Récupérer les avis d'un film
curl http://localhost:3000/avis/film/1
```

---

## Sécurité (notes pédagogiques)

- **SQL** — `mysql2.execute()` avec placeholders `?` → requêtes paramétrées, pas d'injection SQL.
- **NoSQL** — Zod force `z.string()` / `z.number()` sur chaque champ, ce qui rejette les opérateurs MongoDB injectés (ex: `{"$ne": null}`). Mongoose en `strict: true` ignore les champs hors schéma.
- **Sortie** — DTO `toAdherentDTO` / `toAvisDTO` filtrent les champs internes (statut de modération, flags) avant la réponse JSON.
- **Crash fast** — `src/index.ts` teste les deux connexions BDD avant `app.listen`. Si l'une échoue, le process exit(1) immédiatement → jamais de serveur dans un état dégradé.
- **Moindre privilège** — `cineclub_user` a uniquement `SELECT/INSERT/UPDATE/DELETE` sur la base applicative, pas de `DROP` ni de `GRANT`.

---

## Commandes utiles

```bash
# Cycle de vie du conteneur MySQL
docker stop cineclub-mysql
docker start cineclub-mysql
docker logs cineclub-mysql
docker rm -f cineclub-mysql      # ⚠️ supprime aussi les données ajoutées via l'API

# Shell mysql sans rien installer sur Windows
docker exec -it cineclub-mysql mysql -uroot -prootpw cineclub_reunion

# Build de production
npm run build && npm start
```

---

## Dépannage

| Symptôme | Cause probable | Solution |
|----------|----------------|----------|
| `mysql : Le terme «mysql» n'est pas reconnu` | Pas de client MySQL dans le PATH Windows | Utiliser méthode A (Docker) |
| `❌ MySQL injoignable` au démarrage | Conteneur arrêté / mauvais mot de passe | `docker start cineclub-mysql`, vérifier `.env` |
| `Access denied for user 'cineclub_user'@'172.x.x.x'` | User créé seulement pour `@localhost` | Ré-exécuter le `GRANT ... 'cineclub_user'@'%'` (étape 3.A) |
| `❌ MongoDB injoignable` | Service arrêté | `Start-Service MongoDB` ou démarrer le conteneur Mongo |
| `EADDRINUSE :3000` | Port déjà utilisé | Changer `PORT` dans `.env` ou tuer le process |
| `{"error":"Route GET / introuvable"}` | Tentative d'accès à `/` | Pas une erreur — utiliser `/health`, `/adherents`, `/avis/...` |
