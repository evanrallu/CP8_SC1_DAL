// CP8-SC1 — Provisioning MongoDB automatique (exécuté au 1er démarrage du conteneur)
// Version adaptée aux scripts d'init Mongo Docker (pas de `use`, JS pur).
// Miroir de sql/create_user_mongodb.js (déclaratif spec).

db = db.getSiblingDB('cineclub_nosql');

db.createUser({
  user: 'cineclub_app',
  pwd: 'P4$$w0rd',
  roles: [
    { role: 'readWrite', db: 'cineclub_nosql' }
  ]
});
