-- CP8-SC1 — Privilèges du compte applicatif (exécuté automatiquement au 1er démarrage)
-- L'utilisateur cineclub_app est créé par MYSQL_USER avec ALL PRIVILEGES par défaut.
-- On REVOKE tout pour ne garder QUE les 4 privilèges CRUD (principe du moindre privilège).

REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'cineclub_app'@'%';

GRANT SELECT, INSERT, UPDATE, DELETE
    ON cineclub.*
    TO 'cineclub_app'@'%';

FLUSH PRIVILEGES;
