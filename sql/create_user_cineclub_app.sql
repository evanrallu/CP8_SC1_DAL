-- CP8-SC1 — Création du compte applicatif MySQL
-- À exécuter en tant que root, UNE fois
-- Ref: slide 11 — Compte SGBD applicatif

CREATE USER 'cineclub_app'@'%'
  IDENTIFIED BY 'K9!mX2$vQ#8nBp';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON cineclub.*
  TO 'cineclub_app'@'%';

FLUSH PRIVILEGES;

-- Vérification
SHOW GRANTS FOR 'cineclub_app'@'%';
