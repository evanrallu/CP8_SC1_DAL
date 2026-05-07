-- db/migrations/006_seance_version.sql
-- Bonus SC3 : ajoute la colonne version pour le verrouillage optimiste
-- À exécuter après sql_sc03_setup.sql

USE cineclub_reunion;

ALTER TABLE seance
  ADD COLUMN version INT NOT NULL DEFAULT 0
    COMMENT 'Colonne de verrouillage optimiste — incrémentée à chaque UPDATE';

SELECT 'Migration 006 : colonne version ajoutée à seance' AS message;
