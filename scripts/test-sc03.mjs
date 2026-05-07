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
// TEST 5 — Trigger audit : UPDATE "touch" (même valeur) ignoré,
// UPDATE réel (changement de statut) → +1 ligne dans audit_log
// ───────────────────────────────────────────────────────────────────────────
async function testAudit() {
  console.log('🧪 TEST AUDIT — trg_paiement_audit_update doit ignorer les UPDATE "touch"\n');
  const conn = await db();

  // Créer une réservation+paiement de référence si la base est vide
  const [pRows] = await conn.execute('SELECT id, statut FROM paiement ORDER BY id DESC LIMIT 1');
  let paiementId, statutInitial;

  if (pRows.length === 0) {
    console.log('  Aucun paiement existant → création via POST /reservations…');
    const r = await fetch(`${API}/reservations`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ adherentId: 1, seanceId: 2, montantCents: 1500 }),
    });
    const body = await r.json();
    if (r.status !== 201) {
      console.log(`❌ Impossible de créer une réservation : HTTP ${r.status}`, body);
      await conn.end();
      process.exit(1);
    }
    const [fresh] = await conn.execute('SELECT id, statut FROM paiement WHERE id = LAST_INSERT_ID()');
    paiementId    = fresh[0]?.id ?? body.reservationId;
    statutInitial = fresh[0]?.statut ?? 'EN_ATTENTE';
  } else {
    paiementId    = pRows[0].id;
    statutInitial = pRows[0].statut;
  }

  console.log(`  Paiement cible : id=${paiementId}, statut="${statutInitial}"`);

  const [a0] = await conn.execute(
    'SELECT COUNT(*) AS n FROM audit_log WHERE table_name = "paiement" AND row_id = ?',
    [paiementId],
  );
  const auditBefore = a0[0].n;
  console.log(`  ${pad('audit_log')} : ${auditBefore} ligne(s) avant`);

  // ── ① UPDATE "touch" : même statut → trigger doit IGNORER ───────────────
  await conn.execute('UPDATE paiement SET statut = ? WHERE id = ?', [statutInitial, paiementId]);
  const [a1] = await conn.execute(
    'SELECT COUNT(*) AS n FROM audit_log WHERE table_name = "paiement" AND row_id = ?',
    [paiementId],
  );
  const auditAfterTouch = a1[0].n;
  console.log(`  Après UPDATE "touch" (statut → ${statutInitial}) : ${auditAfterTouch} ligne(s)`);

  // ── ② UPDATE réel : changement de statut → trigger doit INSÉRER ────────
  const nouveauStatut = statutInitial === 'VALIDE' ? 'REMBOURSE' : 'VALIDE';
  await conn.execute('UPDATE paiement SET statut = ? WHERE id = ?', [nouveauStatut, paiementId]);
  const [a2] = await conn.execute(
    'SELECT COUNT(*) AS n FROM audit_log WHERE table_name = "paiement" AND row_id = ? ORDER BY id DESC',
    [paiementId],
  );
  const auditAfterReal = a2[0].n;
  console.log(`  Après UPDATE réel  (statut → ${nouveauStatut}) : ${auditAfterReal} ligne(s)`);

  // Inspecter la dernière entrée d'audit
  const [last] = await conn.execute(
    `SELECT action, changed_by, old_value, new_value
       FROM audit_log
      WHERE table_name = 'paiement' AND row_id = ?
      ORDER BY id DESC LIMIT 1`,
    [paiementId],
  );
  if (last.length) {
    console.log(`  Dernière entrée audit_log :`, {
      action:     last[0].action,
      changed_by: last[0].changed_by,
      old:        last[0].old_value,
      new:        last[0].new_value,
    });
  }

  await conn.end();

  const touchIgnored = auditAfterTouch === auditBefore;
  const realLogged   = auditAfterReal  === auditBefore + 1;
  const ok           = touchIgnored && realLogged;

  console.log(
    ok ? '\n✅ Trigger correct — touch ignoré, changement réel audité'
       : `\n❌ Trigger défaillant — touch=${touchIgnored ? 'ok' : `+${auditAfterTouch - auditBefore}`}, ` +
         `réel=${realLogged ? 'ok' : `+${auditAfterReal - auditBefore} (attendu +1)`}`,
  );
  process.exit(ok ? 0 : 1);
}

// ───────────────────────────────────────────────────────────────────────────
const tests = { rollback: testRollback, reserve: testReserve, concurrent: testConcurrent, archive: testArchive, audit: testAudit };
const cmd   = process.argv[2];
const fn    = tests[cmd];

if (!fn) {
  console.error(`Usage : node scripts/test-sc03.mjs <${Object.keys(tests).join('|')}>`);
  process.exit(2);
}

fn().catch(err => { console.error('❌ Erreur inattendue :', err); process.exit(1); });
