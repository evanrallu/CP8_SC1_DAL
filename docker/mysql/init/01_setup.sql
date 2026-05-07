-- docker/mysql/init/01_setup.sql
-- Exécuté automatiquement lors de la PREMIÈRE création du conteneur MySQL
-- (volume mysql_data vide). Pour rejouer : `docker compose down -v && docker compose up -d`.
--
-- Version Docker du sql_setup.sql d'origine :
--   - pas de CREATE DATABASE (déjà créée par MYSQL_DATABASE)
--   - user 'cineclub_user'@'%' (au lieu de @'localhost') car la connexion vient de l'host
--     Docker à travers le bridge réseau, pas de localhost interne au conteneur.

USE cineclub_reunion;

CREATE USER IF NOT EXISTS 'cineclub_user'@'%'
  IDENTIFIED BY 'motdepasse_fort_ici';

GRANT SELECT, INSERT, UPDATE, DELETE ON cineclub_reunion.* TO 'cineclub_user'@'%';
FLUSH PRIVILEGES;

CREATE TABLE IF NOT EXISTS adherent (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  nom              VARCHAR(80)  NOT NULL,
  prenom           VARCHAR(80)  NOT NULL,
  email            VARCHAR(160) NOT NULL UNIQUE,
  telephone        VARCHAR(15),
  actif            TINYINT(1)   NOT NULL DEFAULT 1,
  date_inscription TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS film (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  titre          VARCHAR(200) NOT NULL,
  realisateur    VARCHAR(120) NOT NULL,
  annee          SMALLINT     NOT NULL,
  duree_minutes  SMALLINT     NOT NULL,
  genre          ENUM('drame','comedie','thriller','documentaire','animation') NOT NULL,
  resume         TEXT,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO adherent (nom, prenom, email, telephone) VALUES
  ('Dupont',  'Marie',  'marie.dupont@example.com',  '0692123456'),
  ('Martin',  'Jean',   'jean.martin@example.com',   '0693456789'),
  ('Bernard', 'Sophie', 'sophie.bernard@example.com', NULL);

INSERT INTO film (titre, realisateur, annee, duree_minutes, genre, resume) VALUES
  ('Le Bonheur des uns', 'Pierre Moreau', 2023, 115, 'drame', 'Un film poignant sur les choix de vie.'),
  ('Rire en cascade',    'Anne Lefebvre', 2022,  95, 'comedie', 'Une comédie légère et rafraîchissante.'),
  ('Ombres sur l''île',  'Marc Tessier',  2024, 108, 'thriller', 'Un thriller haletant à La Réunion.');
