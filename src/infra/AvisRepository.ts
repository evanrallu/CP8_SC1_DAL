/**
 * src/infra/AvisRepository.ts
 * Repository Avis avec Mongoose (MongoDB).
 *
 * Points clés :
 * ① strict: true → champs non déclarés ignorés (anti-injection NoSQL)
 * ② lean()  → retourne un objet JS pur, 5-10x plus rapide que le Document Mongoose
 * ③ runValidators: true sur findByIdAndUpdate → les règles du schéma s'appliquent à UPDATE
 * ④ new: true → retourne le document APRÈS modification
 * ⑤ timestamps: true → createdAt / updatedAt automatiques
 */
import { Schema, model, Types } from 'mongoose';
import { CreateAvisDTO, UpdateAvisDTO, ModerationDTO } from '../schemas/avisSchemas';

// ─── Schéma Mongoose ────────────────────────────────────────────────────────
const avisSchema = new Schema(
  {
    adherentId: {
      type: Number,
      required: [true, 'adherentId est obligatoire'],
      index: true,          // accélère les requêtes par adhérent
    },
    filmId: {
      type: Number,
      required: [true, 'filmId est obligatoire'],
      index: true,          // accélère les requêtes par film
    },
    note: {
      type: Number,
      required: [true, 'La note est obligatoire'],
      min: [0, 'Note minimum : 0'],
      max: [5, 'Note maximum : 5'],
    },
    commentaire: {
      type: String,
      maxlength: [2000, 'Commentaire trop long (max 2000 caractères)'],
      trim: true,           // supprime les espaces en début/fin
    },
    tags: [{ type: String, maxlength: 30 }],
    photos: [
      {
        url:     { type: String, required: true },
        legende: { type: String },
      },
    ],
    statut: {
      type: String,
      enum: {
        values: ['publie', 'modere', 'masque'],
        message: 'Statut invalide : {VALUE}',
      },
      default: 'publie',
    },
  },
  {
    timestamps: true,  // ajoute createdAt et updatedAt automatiquement
    strict: true,      // champs non déclarés dans le schéma → ignorés silencieusement
  }
);

// Index composé pour éviter qu'un adhérent note deux fois le même film
avisSchema.index({ adherentId: 1, filmId: 1 }, { unique: true });

const AvisModel = model('Avis', avisSchema);

// ─── Classe Repository ─────────────────────────────────────────────────────
export class AvisRepository {

  /** Récupère tous les avis publiés d'un film, du plus récent au plus ancien */
  async findAllByFilm(filmId: number) {
    return AvisModel
      .find({ filmId, statut: 'publie' })
      .sort({ createdAt: -1 })
      .lean();  // retourne des objets JS purs (plus rapide)
  }

  /** Récupère tous les avis d'un adhérent (tous statuts) */
  async findAllByAdherent(adherentId: number) {
    return AvisModel
      .find({ adherentId })
      .sort({ createdAt: -1 })
      .lean();
  }

  /** Récupère un avis par son _id MongoDB */
  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null; // évite une erreur Mongoose
    return AvisModel.findById(id).lean();
  }

  /** Crée un nouvel avis — les validateurs du schéma s'exécutent automatiquement */
  async create(data: CreateAvisDTO) {
    return AvisModel.create(data);
  }

  /**
   * Met à jour un avis.
   * CRITIQUE : runValidators: true → sans ça, les règles min/max/maxlength sont ignorées !
   * new: true → retourne le document APRÈS modification, pas avant.
   */
  async update(id: string, data: UpdateAvisDTO) {
    if (!Types.ObjectId.isValid(id)) return null;
    return AvisModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .lean();
  }

  /** Modération : change le statut d'un avis (admin uniquement) */
  async moderate(id: string, data: ModerationDTO) {
    if (!Types.ObjectId.isValid(id)) return null;
    return AvisModel
      .findByIdAndUpdate(id, { statut: data.statut }, { new: true, runValidators: true })
      .lean();
  }

  /** Supprime un avis. Retourne le document supprimé ou null. */
  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return AvisModel.findByIdAndDelete(id);
  }

  /** Calcule la note moyenne d'un film (agrégation MongoDB) */
  async getAverageNote(filmId: number): Promise<number | null> {
    const result = await AvisModel.aggregate([
      { $match: { filmId, statut: 'publie' } },
      { $group: { _id: null, moyenne: { $avg: '$note' } } },
    ]);
    return result[0]?.moyenne ?? null;
  }
}
