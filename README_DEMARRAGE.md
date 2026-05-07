# CinéClub Réunion — CP8 SC02 : CRUD Sécurisé SQL + NoSQL

## Structure du projet

```
src/
├── config/
│   └── env.ts                    ← Validation des .env avec Zod (crash fast)
├── domain/
│   ├── Adherent.ts               ← Interface + DTO + mapper de sortie
│   └── Avis.ts                   ← Interface + DTO + mapper de sortie
├── infra/
│   ├── mysql.ts                  ← Pool MySQL singleton + transaction helper
│   ├── mongodb.ts                ← Connexion Mongoose
│   ├── AdherentRepositoryMySQL.ts ← CRUD SQL sécurisé (execute + ?)
│   └── AvisRepository.ts         ← CRUD NoSQL (Mongoose + lean + runValidators)
├── schemas/
│   ├── adherentSchemas.ts        ← Zod : CreateAdherentSchema, UpdateAdherentSchema
│   └── avisSchemas.ts            ← Zod : CreateAvisSchema, UpdateAvisSchema, ModerationSchema
├── routes/
│   ├── adherents.ts              ← Routes Express /adherents
│   └── avis.ts                   ← Routes Express /avis
└── index.ts                      ← Bootstrap (crash fast si BDD injoignable)
```

## Démarrage rapide

### 1. Installer les dépendances
```bash
npm install
```

### 2. Configurer l'environnement
```bash
cp .env.example .env
# Puis éditer .env avec tes identifiants MySQL et MongoDB
```

### 3. Créer la base MySQL
```bash
mysql -u root -p < sql_setup.sql
```

### 4. Lancer l'application
```bash
npm run dev
```

L'API est disponible sur http://localhost:3000

---

## Endpoints disponibles

### Adhérents (SQL / MySQL)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | /adherents | Liste tous les adhérents actifs |
| GET | /adherents/:id | Récupère un adhérent |
| POST | /adherents | Crée un adhérent |
| PUT | /adherents/:id | Met à jour un adhérent |
| DELETE | /adherents/:id | Désactive un adhérent (soft delete) |

### Avis (NoSQL / MongoDB)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | /avis/film/:filmId | Avis publiés d'un film + note moyenne |
| GET | /avis/adherent/:adherentId | Avis d'un adhérent |
| GET | /avis/:id | Un avis par son id MongoDB |
| POST | /avis | Crée un avis |
| PUT | /avis/:id | Met à jour un avis |
| PATCH | /avis/:id/moderation | Change le statut (publie/modere/masque) |
| DELETE | /avis/:id | Supprime un avis |

---

## Exemples de requêtes (curl)

```bash
# Créer un adhérent
curl -X POST http://localhost:3000/adherents \
  -H "Content-Type: application/json" \
  -d '{"nom":"Dupont","prenom":"Marie","email":"marie@example.com","telephone":"0692123456"}'

# Créer un avis
curl -X POST http://localhost:3000/avis \
  -H "Content-Type: application/json" \
  -d '{"adherentId":1,"filmId":1,"note":4,"commentaire":"Très bon film !"}'

# Récupérer les avis d'un film
curl http://localhost:3000/avis/film/1
```
