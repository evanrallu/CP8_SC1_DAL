-- docker/mysql/init/02_sc03.sql
-- Version Docker du sql_sc03_setup.sql (GRANT EXECUTE → 'cineclub_user'@'%')

USE cineclub_reunion;

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

CREATE TABLE IF NOT EXISTS reservation (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  adherent_id INT NOT NULL,
  seance_id   INT NOT NULL,
  statut      ENUM('CONFIRMEE','ANNULEE','EN_ATTENTE') NOT NULL DEFAULT 'EN_ATTENTE',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resa_adherent FOREIGN KEY (adherent_id) REFERENCES adherent(id),
  CONSTRAINT fk_resa_seance   FOREIGN KEY (seance_id)   REFERENCES seance(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paiement (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  montant_cents  INT NOT NULL,
  statut         ENUM('EN_ATTENTE','VALIDE','REMBOURSE','ECHEC') NOT NULL DEFAULT 'EN_ATTENTE',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_paiement_resa FOREIGN KEY (reservation_id) REFERENCES reservation(id),
  CONSTRAINT chk_montant      CHECK (montant_cents >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seance_archive (
  id              INT PRIMARY KEY,
  film_id         INT NOT NULL,
  date_seance     DATETIME NOT NULL,
  places_totales  SMALLINT NOT NULL,
  archived_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(64)              NOT NULL,
  row_id     BIGINT                   NOT NULL,
  action     ENUM('UPDATE','DELETE')  NOT NULL,
  changed_by VARCHAR(120)             NOT NULL,
  changed_at TIMESTAMP                NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  old_value  JSON,
  new_value  JSON,
  INDEX idx_table_row (table_name, row_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO seance (film_id, date_seance, places_totales, places_restantes) VALUES
  (1, DATE_ADD(NOW(), INTERVAL 7  DAY), 50, 50),
  (2, DATE_ADD(NOW(), INTERVAL 14 DAY), 30, 30),
  (3, DATE_SUB(NOW(), INTERVAL 30 DAY), 80, 80);

DROP PROCEDURE IF EXISTS sp_archive_old_seances;

DELIMITER //

CREATE PROCEDURE sp_archive_old_seances (
  IN  p_avant_date DATE,
  OUT p_nb_archivees INT
)
BEGIN
  DECLARE v_count INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  INSERT INTO seance_archive (id, film_id, date_seance, places_totales)
    SELECT id, film_id, date_seance, places_totales
      FROM seance
     WHERE date_seance < p_avant_date;

  SET v_count = ROW_COUNT();

  DELETE FROM seance
   WHERE date_seance < p_avant_date;

  COMMIT;

  SET p_nb_archivees = v_count;
END //

DELIMITER ;

GRANT EXECUTE
  ON PROCEDURE cineclub_reunion.sp_archive_old_seances
  TO 'cineclub_user'@'%';

FLUSH PRIVILEGES;

DROP TRIGGER IF EXISTS trg_paiement_audit_update;

DELIMITER //

CREATE TRIGGER trg_paiement_audit_update
AFTER UPDATE ON paiement
FOR EACH ROW
BEGIN
  IF OLD.montant_cents <> NEW.montant_cents
  OR OLD.statut        <> NEW.statut THEN

    INSERT INTO audit_log
      (table_name, row_id,   action,   changed_by,      old_value,           new_value)
    VALUES
      ('paiement', NEW.id, 'UPDATE', CURRENT_USER(),
       JSON_OBJECT(
         'montant_cents', OLD.montant_cents,
         'statut',        OLD.statut
       ),
       JSON_OBJECT(
         'montant_cents', NEW.montant_cents,
         'statut',        NEW.statut
       )
      );

  END IF;
END //

DELIMITER ;
