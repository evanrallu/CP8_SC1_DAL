-- sql_sc03_setup.sql
-- SC03 : tables transactionnelles + procédure stockée + trigger d'audit
-- À exécuter APRÈS sql_setup.sql (qui crée la base et les tables adherent + film)
-- Commande : Get-Content sql_sc03_setup.sql | mysql -u root -p

USE cineclub_reunion;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 1 — Nouvelles tables métier
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Table séance ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seance (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  film_id          INT        NOT NULL,
  date_seance      DATETIME   NOT NULL,
  places_totales   SMALLINT   NOT NULL DEFAULT 100,
  places_restantes SMALLINT   NOT NULL DEFAULT 100,
  version          INT        NOT NULL DEFAULT 0
    COMMENT 'Verrouillage optimiste — incrémenté à chaque UPDATE',
  created_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_seance_film    FOREIGN KEY (film_id) REFERENCES film(id),
  CONSTRAINT chk_places        CHECK (places_restantes >= 0),
  CONSTRAINT chk_places_totales CHECK (places_totales > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Table reservation ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  adherent_id INT NOT NULL,
  seance_id   INT NOT NULL,
  statut      ENUM('CONFIRMEE','ANNULEE','EN_ATTENTE') NOT NULL DEFAULT 'EN_ATTENTE',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resa_adherent FOREIGN KEY (adherent_id) REFERENCES adherent(id),
  CONSTRAINT fk_resa_seance   FOREIGN KEY (seance_id)   REFERENCES seance(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Table paiement ───────────────────────────────────────────────────────
-- montant_cents en centimes (ex: 1200 = 12,00€) — jamais de flottants pour l'argent
CREATE TABLE IF NOT EXISTS paiement (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  montant_cents  INT NOT NULL,
  statut         ENUM('EN_ATTENTE','VALIDE','REMBOURSE','ECHEC') NOT NULL DEFAULT 'EN_ATTENTE',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_paiement_resa FOREIGN KEY (reservation_id) REFERENCES reservation(id),
  CONSTRAINT chk_montant      CHECK (montant_cents >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Table seance_archive ─────────────────────────────────────────────────
-- Archive des séances passées — alimentée par sp_archive_old_seances
CREATE TABLE IF NOT EXISTS seance_archive (
  id              INT PRIMARY KEY,   -- même id que seance (pas AUTO_INCREMENT)
  film_id         INT NOT NULL,
  date_seance     DATETIME NOT NULL,
  places_totales  SMALLINT NOT NULL,
  archived_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Table audit_log (Livrable 3) ────────────────────────────────────────
-- Append-only : JAMAIS de UPDATE ni DELETE sur cette table
-- Seul le trigger (DEFINER = root) peut y écrire
-- Le compte applicatif cineclub_user n'a AUCUN droit dessus
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(64)              NOT NULL,
  row_id     BIGINT                   NOT NULL,
  action     ENUM('UPDATE','DELETE')  NOT NULL,
  changed_by VARCHAR(120)             NOT NULL  COMMENT 'CURRENT_USER() au moment du trigger',
  changed_at TIMESTAMP                NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  old_value  JSON,
  new_value  JSON,
  INDEX idx_table_row (table_name, row_id)  -- pour "qui a modifié paiement.id=42 ?" en O(log n)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Données de test ───────────────────────────────────────────────────────
INSERT INTO seance (film_id, date_seance, places_totales, places_restantes) VALUES
  (1, DATE_ADD(NOW(), INTERVAL 7  DAY), 50, 50),  -- dans 7 jours
  (2, DATE_ADD(NOW(), INTERVAL 14 DAY), 30, 30),  -- dans 14 jours
  (3, DATE_SUB(NOW(), INTERVAL 30 DAY), 80, 80);  -- il y a 30 jours (pour tester l'archivage)

SELECT 'Tables SC03 créées avec succès' AS message;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 2 — Procédure stockée sp_archive_old_seances (Livrable 2)
-- ═══════════════════════════════════════════════════════════════════════════

DROP PROCEDURE IF EXISTS sp_archive_old_seances;

DELIMITER //

CREATE PROCEDURE sp_archive_old_seances (
  IN  p_avant_date DATE,    -- date limite (séances < p_avant_date sont archivées)
  OUT p_nb_archivees INT    -- nombre de séances archivées (retourné via SELECT @nb)
)
BEGIN
  -- ① Déclaration des variables locales
  --   DOIT être en premier dans le BEGIN/END, avant tout autre code
  DECLARE v_count INT DEFAULT 0;

  -- ② Handler défensif — NON-NÉGOCIABLE pour l'EPCF
  --   Sans ce handler : si erreur SQL au milieu → transaction reste OUVERTE
  --   → connexion bloquée → pool épuisé → API tombe en prod
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;  -- propage l'erreur d'origine au client Node.js (pas une enveloppe générique)
  END;

  -- ③ Corps transactionnel
  START TRANSACTION;

  -- Copier les séances passées dans l'archive
  INSERT INTO seance_archive (id, film_id, date_seance, places_totales)
    SELECT id, film_id, date_seance, places_totales
      FROM seance
     WHERE date_seance < p_avant_date;

  -- ROW_COUNT() retourne le nb de lignes affectées par la dernière requête
  -- IMPORTANT : à capter immédiatement, avant toute autre requête
  SET v_count = ROW_COUNT();

  -- Supprimer les séances archivées de la table principale
  DELETE FROM seance
   WHERE date_seance < p_avant_date;

  COMMIT;

  -- ④ Alimenter le paramètre OUT
  --   Côté Node.js : CALL sp_archive_old_seances(?, @nb) puis SELECT @nb AS nb
  SET p_nb_archivees = v_count;

END //

DELIMITER ;

-- Donner le droit d'exécuter la procédure au compte applicatif
-- (sans lui donner GRANT DELETE sur seance — moindre privilège)
GRANT EXECUTE
  ON PROCEDURE cineclub_reunion.sp_archive_old_seances
  TO 'cineclub_user'@'localhost';

FLUSH PRIVILEGES;

SELECT 'Procédure sp_archive_old_seances créée' AS message;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 3 — Trigger d'audit (Livrable 3)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_paiement_audit_update;

DELIMITER //

CREATE TRIGGER trg_paiement_audit_update
AFTER UPDATE ON paiement
FOR EACH ROW
BEGIN
  -- Filtrage défensif : on n'audite QUE si montant ou statut ont changé.
  -- Sans ce IF, un ORM qui réécrit toutes les colonnes (même si rien n'a changé)
  -- polluerait audit_log avec des lignes inutiles.
  IF OLD.montant_cents <> NEW.montant_cents
  OR OLD.statut        <> NEW.statut THEN

    INSERT INTO audit_log
      (table_name, row_id,   action,   changed_by,      old_value,           new_value)
    VALUES
      ('paiement', NEW.id, 'UPDATE', CURRENT_USER(),
       -- OLD.xxx = valeurs AVANT la modification
       JSON_OBJECT(
         'montant_cents', OLD.montant_cents,
         'statut',        OLD.statut
       ),
       -- NEW.xxx = valeurs APRÈS la modification
       JSON_OBJECT(
         'montant_cents', NEW.montant_cents,
         'statut',        NEW.statut
       )
      );

  END IF;
END //

DELIMITER ;

SELECT 'Trigger trg_paiement_audit_update créé' AS message;

-- ═══════════════════════════════════════════════════════════════════════════
-- TESTS RAPIDES (à lancer manuellement dans le client mysql)
-- ═══════════════════════════════════════════════════════════════════════════

-- Test 1 : insérer une réservation + paiement manuellement
-- INSERT INTO reservation (adherent_id, seance_id, statut) VALUES (1, 1, 'CONFIRMEE');
-- INSERT INTO paiement (reservation_id, montant_cents, statut) VALUES (LAST_INSERT_ID(), 1200, 'EN_ATTENTE');

-- Test 2 : déclencher le trigger (changer le statut du paiement)
-- UPDATE paiement SET statut = 'VALIDE' WHERE id = 1;
-- SELECT * FROM audit_log;  -- doit afficher 1 ligne

-- Test 3 : UPDATE qui ne change RIEN → audit_log ne doit PAS bouger
-- UPDATE paiement SET statut = 'VALIDE' WHERE id = 1;  -- même valeur
-- SELECT COUNT(*) FROM audit_log;  -- toujours 1

-- Test 4 : archivage via procédure stockée
-- CALL sp_archive_old_seances(CURDATE(), @nb);
-- SELECT @nb AS nb_archivees;
-- SELECT * FROM seance_archive;
