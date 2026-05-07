/**
 * src/infra/FilmRepositoryMySQL.ts
 * Implémentation MySQL du FilmRepository.
 *
 * Règles de sécurité appliquées :
 * ① execute() TOUJOURS — jamais query() avec interpolation
 * ② Placeholders ? pour chaque valeur — jamais ${variable} dans le SQL
 * ③ Mapper toFilm() : snake_case → camelCase
 * ④ Read-after-write après INSERT
 * ⑤ searchByTitle échappe les wildcards LIKE (% et _) côté valeur
 */
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool } from './mysql';
import { Film, GenreFilm } from '../domain/Film';
import { FilmRepository } from './FilmRepository';
import { CreateFilmDTO, UpdateFilmDTO } from '../schemas/filmSchemas';

// ─── Mapper BDD → Domaine ──────────────────────────────────────────────────
function toFilm(row: RowDataPacket): Film {
  return {
    id:           row.id,
    titre:        row.titre,
    realisateur:  row.realisateur,
    annee:        row.annee,
    dureeMinutes: row.duree_minutes,
    genre:        row.genre as GenreFilm,
    resume:       row.resume ?? null,
    createdAt:    row.created_at,
  };
}

// ─── Échappement des wildcards LIKE ────────────────────────────────────────
// MySQL traite \, %, _ comme spéciaux dans LIKE.
// On les échappe AVANT d'ajouter les % englobants pour éviter qu'un titre
// contenant "%" se transforme en wildcard côté serveur.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

const COLS = 'id, titre, realisateur, annee, duree_minutes, genre, resume, created_at';

export class FilmRepositoryMySQL implements FilmRepository {

  async findAll(): Promise<Film[]> {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT ${COLS} FROM film ORDER BY annee DESC, titre`,
    );
    return rows.map(toFilm);
  }

  async findById(id: number): Promise<Film | null> {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT ${COLS} FROM film WHERE id = ?`,
      [id],
    );
    return rows[0] ? toFilm(rows[0]) : null;
  }

  /**
   * Recherche par titre (LIKE sécurisé).
   * - La valeur passe par un placeholder ? → pas d'injection SQL possible
   * - Les wildcards % et _ sont échappés → un titre "100%" ne devient pas un wildcard
   */
  async searchByTitle(q: string): Promise<Film[]> {
    const pattern = `%${escapeLike(q)}%`;
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT ${COLS} FROM film WHERE titre LIKE ? ORDER BY annee DESC, titre`,
      [pattern],
    );
    return rows.map(toFilm);
  }

  async create(data: CreateFilmDTO): Promise<Film> {
    const [result] = await getPool().execute<ResultSetHeader>(
      `INSERT INTO film (titre, realisateur, annee, duree_minutes, genre, resume)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.titre,
        data.realisateur,
        data.annee,
        data.dureeMinutes,
        data.genre,
        data.resume ?? null,
      ],
    );
    return (await this.findById(result.insertId))!;
  }

  async update(id: number, data: UpdateFilmDTO): Promise<Film | null> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.titre        !== undefined) { fields.push('titre = ?');         values.push(data.titre); }
    if (data.realisateur  !== undefined) { fields.push('realisateur = ?');   values.push(data.realisateur); }
    if (data.annee        !== undefined) { fields.push('annee = ?');         values.push(data.annee); }
    if (data.dureeMinutes !== undefined) { fields.push('duree_minutes = ?'); values.push(data.dureeMinutes); }
    if (data.genre        !== undefined) { fields.push('genre = ?');         values.push(data.genre); }
    if (data.resume       !== undefined) { fields.push('resume = ?');        values.push(data.resume); }

    if (fields.length === 0) return this.findById(id);

    values.push(id);

    const [result] = await getPool().execute<ResultSetHeader>(
      `UPDATE film SET ${fields.join(', ')} WHERE id = ?`,
      values,
    );

    if (result.affectedRows === 0) return null;
    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const [result] = await getPool().execute<ResultSetHeader>(
      `DELETE FROM film WHERE id = ?`,
      [id],
    );
    return result.affectedRows > 0;
  }
}
