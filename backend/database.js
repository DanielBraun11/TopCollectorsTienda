// ============================================================
// database.js
// ============================================================

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'db', 'tienda.sqlite');
const db      = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

function initDB() {

  // ----------------------------------------------------------
  // TABLA: colecciones
  // ----------------------------------------------------------
  // El año se extrae automáticamente del nombre al insertar.
  // Ej: "Liga Este 2003-04" → anyo = "2003-04"
  // ----------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS colecciones (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre     TEXT    NOT NULL UNIQUE,
      anyo       TEXT,
      deporte    TEXT    NOT NULL DEFAULT 'futbol',
      creado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ----------------------------------------------------------
  // TABLA: lotes
  // ----------------------------------------------------------
  // Cada fila es un cromo/lote en venta.
  // El año ya no está aquí — pertenece a la colección.
  //
  // CONCEPTO — numero_cromo:
  //   Puede repetirse entre equipos distintos dentro de la
  //   misma colección (Liga Este nº1 Barça ≠ Liga Este nº1
  //   Madrid). La combinación única es:
  //   coleccion_id + equipo + numero_cromo
  // ----------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS lotes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      coleccion_id  INTEGER NOT NULL REFERENCES colecciones(id),
      titulo        TEXT    NOT NULL,
      jugador       TEXT,
      equipo        TEXT,
      numero_cromo  TEXT,
      precio        REAL    NOT NULL,
      estado        TEXT    NOT NULL DEFAULT 'excelente',
      descripcion   TEXT,
      imagen_url    TEXT,
      vendido       INTEGER NOT NULL DEFAULT 0,
      creado_en     TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ----------------------------------------------------------
  // TABLA: equipos (caché para los filtros del frontend)
  // ----------------------------------------------------------
  // Se rellena automáticamente al subir lotes nuevos.
  // UNIQUE(coleccion_id, equipo) evita duplicados.
  // ----------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      coleccion_id  INTEGER NOT NULL REFERENCES colecciones(id),
      equipo        TEXT    NOT NULL,
      UNIQUE(coleccion_id, equipo)
    )
  `);

  console.log('✅ Base de datos inicializada correctamente');
}

initDB();

module.exports = db;
