// Preop Checklist — shared backend
// Stores the Elective Preop room lists + checkbox state, and the single
// Anesthesia Preop working form, in Postgres so every computer/browser
// that opens this app sees the same data.

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '5mb' }));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add a Postgres database and connect its connection string.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      room_key TEXT PRIMARY KEY,
      date TEXT,
      room TEXT,
      patients JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checks (
      patient_key TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS anes_form (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// ---------- Health check ----------
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- Elective Preop ----------

// Full snapshot: { rooms: {roomKey: {date, room, patients}}, checks: {patientKey: {...}} }
app.get('/api/elective', async (req, res) => {
  try {
    const roomsRes = await pool.query('SELECT room_key, date, room, patients FROM rooms');
    const checksRes = await pool.query('SELECT patient_key, data FROM checks');
    const rooms = {};
    roomsRes.rows.forEach(r => {
      rooms[r.room_key] = { date: r.date, room: r.room, patients: r.patients };
    });
    const checks = {};
    checksRes.rows.forEach(r => {
      checks[r.patient_key] = r.data;
    });
    res.json({ rooms, checks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load elective data' });
  }
});

// Upload/replace a room's patient list (called once per uploaded room file)
app.post('/api/elective/rooms', async (req, res) => {
  try {
    const { roomKey, date, room, patients } = req.body || {};
    if (!roomKey) return res.status(400).json({ error: 'roomKey required' });
    await pool.query(
      `INSERT INTO rooms (room_key, date, room, patients, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (room_key) DO UPDATE
         SET date = $2, room = $3, patients = $4::jsonb, updated_at = now()`,
      [roomKey, date || '', room || '', JSON.stringify(patients || [])]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save room' });
  }
});

// Remove an entire room's list
app.delete('/api/elective/rooms/:roomKey', async (req, res) => {
  try {
    await pool.query('DELETE FROM rooms WHERE room_key = $1', [req.params.roomKey]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Remove a single patient row from a room
app.delete('/api/elective/rooms/:roomKey/patients/:patientKey', async (req, res) => {
  try {
    const { roomKey, patientKey } = req.params;
    const r = await pool.query('SELECT patients FROM rooms WHERE room_key = $1', [roomKey]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'room not found' });
    const patients = (r.rows[0].patients || []).filter(p => p.key !== patientKey);
    await pool.query(
      'UPDATE rooms SET patients = $1::jsonb, updated_at = now() WHERE room_key = $2',
      [JSON.stringify(patients), roomKey]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

// Toggle one checklist item for one patient (merges into existing check state)
app.patch('/api/elective/checks/:patientKey', async (req, res) => {
  try {
    const { patientKey } = req.params;
    const { item, value } = req.body || {};
    if (!item) return res.status(400).json({ error: 'item required' });
    await pool.query(
      `INSERT INTO checks (patient_key, data, updated_at)
       VALUES ($1, jsonb_build_object($2::text, $3::boolean), now())
       ON CONFLICT (patient_key) DO UPDATE
         SET data = checks.data || jsonb_build_object($2::text, $3::boolean), updated_at = now()`,
      [patientKey, item, !!value]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save check' });
  }
});

// Clear everything (Clear List button)
app.delete('/api/elective', async (req, res) => {
  try {
    await pool.query('DELETE FROM rooms');
    await pool.query('DELETE FROM checks');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to clear elective data' });
  }
});

// ---------- Anesthesia Preop (single shared working form) ----------

app.get('/api/anes', async (req, res) => {
  try {
    const r = await pool.query('SELECT data FROM anes_form WHERE id = 1');
    res.json(r.rows[0] ? r.rows[0].data : {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load anesthesia form' });
  }
});

app.put('/api/anes', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO anes_form (id, data, updated_at) VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = now()`,
      [JSON.stringify(req.body || {})]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save anesthesia form' });
  }
});

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log('Preop checklist app listening on port ' + PORT));
  })
  .catch(err => {
    console.error('Database init failed:', err);
    process.exit(1);
  });
