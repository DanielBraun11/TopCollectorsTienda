// ============================================================
// routes/colecciones.js
// ============================================================
// Gestiona las colecciones y los filtros dinámicos (equipos).
// El año ya forma parte del nombre de la colección.
// ============================================================

const express = require('express');
const router  = express.Router();
const db      = require('../database');


// ============================================================
// GET /api/colecciones
// ============================================================
// Lista todas las colecciones disponibles.
// Incluye el número de lotes disponibles en cada una.
// ============================================================
router.get('/', (req, res) => {
  try {
    const colecciones = db.prepare(`
      SELECT c.*,
        COUNT(l.id) as total_lotes
      FROM colecciones c
      LEFT JOIN lotes l ON l.coleccion_id = c.id AND l.vendido = 0
      GROUP BY c.id
      ORDER BY c.nombre
    `).all();

    res.json({ ok: true, colecciones });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Error al obtener colecciones' });
  }
});


// ============================================================
// GET /api/colecciones/:id
// ============================================================
// Devuelve una colección concreta con sus equipos disponibles.
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const coleccion = db.prepare('SELECT * FROM colecciones WHERE id = ?').get(req.params.id);
    if (!coleccion) return res.status(404).json({ ok: false, error: 'Colección no encontrada' });

    const equipos = db.prepare(`
      SELECT equipo FROM equipos WHERE coleccion_id = ? ORDER BY equipo ASC
    `).all(req.params.id).map(e => e.equipo);

    res.json({ ok: true, coleccion: { ...coleccion, equipos } });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Error al obtener la colección' });
  }
});


// ============================================================
// GET /api/colecciones/:id/equipos
// ============================================================
// Devuelve los equipos disponibles de una colección.
// Alimenta el panel desplegable COLECCIÓN → EQUIPO.
//
// Soporta búsqueda parcial: ?busqueda=bar
// → devuelve "FC Barcelona", "Athletic Bilbao"...
// ============================================================
router.get('/:id/equipos', (req, res) => {
  try {
    const { busqueda } = req.query;
    let sql    = 'SELECT equipo FROM equipos WHERE coleccion_id = ?';
    const params = [req.params.id];

    // Búsqueda dentro del desplegable (sin sensibilidad a mayúsculas)
    if (busqueda) {
      sql += ' AND LOWER(equipo) LIKE ?';
      params.push(`%${busqueda.toLowerCase()}%`);
    }

    sql += ' ORDER BY equipo ASC';

    const equipos = db.prepare(sql).all(...params).map(e => e.equipo);
    res.json({ ok: true, equipos });

  } catch (error) {
    res.status(500).json({ ok: false, error: 'Error al obtener equipos' });
  }
});


// ============================================================
// POST /api/colecciones
// ============================================================
// Crea una colección manualmente (sin pasar por el Fotomatón).
// El Fotomatón las crea automáticamente, pero este endpoint
// es útil para el panel de administración.
// ============================================================
router.post('/', (req, res) => {
  try {
    const { nombre, deporte } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });

    // Extraemos el año del nombre automáticamente
    const match = nombre.match(/(\d{4}-\d{2,4}|\d{4})/);
    const anyo  = match ? match[1] : null;

    const resultado = db.prepare(
      'INSERT INTO colecciones (nombre, anyo, deporte) VALUES (?, ?, ?)'
    ).run(nombre.trim(), anyo, deporte || 'futbol');

    res.status(201).json({ ok: true, mensaje: 'Colección creada', id: resultado.lastInsertRowid });

  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ ok: false, error: 'Ya existe una colección con ese nombre' });
    }
    res.status(500).json({ ok: false, error: 'Error al crear la colección' });
  }
});


module.exports = router;
