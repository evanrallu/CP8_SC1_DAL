// scripts/test-sc03.mjs
// Tests fonctionnels SC03 — appelle l'API et vérifie l'état MySQL avant/après.
// Usage : node scripts/test-sc03.mjs <rollback|reserve|concurrent|archive>
import 'dotenv/config';
import mysql from 'mysql2/promise';

const API = process.env.API_URL ?? 'http://localhost:3000';

function pad(label, w = 12) { return label.padEnd(w, ' '); }

async function db() {
  return mysql.createConnection({
    host:     process.env.MYSQL_HOST,
    port:     Number(process.env.MYSQL_PORT),
    user:     process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });
}

async function snapshot(conn, seanceId) {
  const [r] = await conn.execute('SELECT places_restantes FROM seance WHERE id = ?', [seanceId]);
  const [c] = await conn.execute('SELECT COUNT(*) AS n FROM reservation');
  const [p] = await conn.execute('SELECT COUNT(*) AS n FROM paiement');
  return {
    places:       r[0]?.places_restantes ?? null,
    reservations: c[0].n,
    paiements:    p[0].n,
  };
}

function diff(before, after) {
  return {
    places:       (after.places ?? 0) - (before.places ?? 0),
    reservations: after.reservations - before.reservations,
    paiements:    after.paiements    - before.paiements,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// TEST 1 — Rollback : adherentId inexistant → INSERT reservation viole la FK
// → la transaction doit être intégralement annulée (pas d'INSERT, places intactes)
// ───────────────────────────────────────────────────────────────────────────
async function testRollback() {
  console.log('🧪 TEST ROLLBACK — adherentId=99999 (FK invalide) doit annuler toute la transaction\n');
  const conn = await db();
  const SEANCE = 1;
  const before = await snapshot(conn, SEANCE);
  console.log(`  ${pad('Avant')} :`, before);

  const res  = await fetch(`${API}/reservations`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ adherentId: 99999, seanceId: SEANCE, montantCents: 1200 }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`  ${pad('Réponse')} : HTTP ${res.status}`, body);

  const after = await snapshot(conn, SEANCE);
  console.log(`  ${pad('Après')} :`, after);
  console.log(`  ${pad('Δ')} :`, diff(before, after));

  await conn.end();
  const ok = res.status >= 400
          && before.places       === after.places
          && before.reservations === after.reservations
          && before.paiements    === after.paiements;
  console.log(ok ? '\n✅ ROLLBACK complet — état BD strictement identique'
                 : '\n❌ ROLLBACK INCOMPLET — la BD a bougé');
  process.exit(ok ? 0 : 1);
}

// ───────────────────────────────────────────────────────────────────────────
// TEST 2 — Réservation valide : COMMIT → places-1, +1 reservation, +1 paiement
// ───────────────────────────────────────────────────────────────────────────
async function testReserve() {
  console.log('🧪 TEST RESERVE — réservation valide doit décrémenter places et créer 1 reservation + 1 paiement\n');
  const conn = await db();
  const SEANCE = 2;
  const before = await snapshot(conn, SEANCE);
  console.log(`  ${pad('Avant')} :`, before);

  const res  = await fetch(`${API}/reservations`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ adherentId: 1, seanceId: SEANCE, montantCents: 1200 }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`  ${pad('Réponse')} : HTTP ${res.status}`, body);

  const after = await snapshot(conn, SEANCE);
  console.log(`  ${pad('Après')} :`, after);
  console.log(`  ${pad('Δ')} :`, diff(before, after));

  await conn.end();
  const d  = diff(before, after);
  const ok = res.status === 201 && d.places === -1 && d.reservations === 1 && d.paiements === 1;
  console.log(ok ? '\n✅ COMMIT — atomicité respectée (3 écritures cohérentes)'
                 : '\n❌ Quelque chose cloche');
  process.exit(ok ? 0 : 1);
}

// ───────────────────────────────────────────────────────────────────────────
// TEST 3 — Concurrence : N requêtes parallèles sur la même séance
// → places_restantes - N (pas de surbooking, pas de double-décrément)
// ───────────────────────────────────────────────────────────────────────────
async function testConcurrent() {
  const N = 5;
  console.log(`🧪 TEST CONCURRENCE — ${N} POST simultanés sur la même séance (FOR UPDATE doit sérialiser)\n`);
  const conn = await db();
  const SEANCE = 1;
  const before = await snapshot(conn, SEANCE);
  console.log(`  ${pad('Avant')} :`, before);

  const statuses = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      fetch(`${API}/reservations`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ adherentId: (i % 3) + 1, seanceId: SEANCE, montantCents: 1200 }),
      }).then(r => r.status),
    ),
  );

  const after = await snapshot(conn, SEANCE);
  await conn.end();
  const ok201 = statuses.filter(s => s === 201).length;
  const d     = diff(before, after);
  console.log(`  ${pad('HTTP')} :`, statuses);
  console.log(`  ${pad('201 OK')} : ${ok201}/${N}`);
  console.log(`  ${pad('Après')} :`, after);
  console.log(`  ${pad('Δ')} :`, d);

  const ok = d.places === -ok201 && d.reservations === ok201 && d.paiements === ok201;
  console.log(ok ? `\n✅ Cohérent — ${ok201} réservations, places décrémentées d'autant (aucun surbooking)`
                 : `\n❌ Incohérence — surbooking ou double-décrément détecté`);
  process.exit(ok ? 0 : 1);
}

// ───────────────────────────────────────────────────────────────────────────
// TEST 4 — Archive : appel de la procédure stockée sp_archive_old_seances
// ───────────────────────────────────────────────────────────────────────────
async function testArchive() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`🧪 TEST ARCHIVE — sp_archive_old_seances(< ${today})\n`);

  const res  = await fetch(`${API}/reservations/archive`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ avantDate: today }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`  HTTP ${res.status} →`, body);

  const ok = res.status === 200 && typeof body.nbArchivees === 'number';
  console.log(ok ? `\n✅ Procédure exécutée (${body.nbArchivees} séance(s) archivée(s))`
                 : `\n❌ Procédure en échec`);
  process.exit(ok ? 0 : 1);
}

// ───────────────────────────────────────────────────────────────────────────
const tests = { rollback: testRollback, reserve: testReserve, concurrent: testConcurrent, archive: testArchive };
const cmd   = process.argv[2];
const fn    = tests[cmd];

if (!fn) {
  console.error(`Usage : node scripts/test-sc03.mjs <${Object.keys(tests).join('|')}>`);
  process.exit(2);
}

fn().catch(err => { console.error('❌ Erreur inattendue :', err); process.exit(1); });
