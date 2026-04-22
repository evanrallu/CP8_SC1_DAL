// CP8-SC1 — Création du compte applicatif MongoDB
// À exécuter dans mongosh en tant qu'admin
// Ref: slide 11 — Compte SGBD applicatif

use cineclub_nosql

db.createUser({
  user: "cineclub_app",
  pwd: "P4$$w0rd",
  roles: [
    { role: "readWrite",
      db: "cineclub_nosql" }
  ]
});
