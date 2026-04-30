// ============================================================
// routes/lotes.js
// ============================================================

const express = require('express');
const router  = express.Router();
const db      = require('../database');


// ============================================================
// GET /api/lotes/destacados
// ============================================================
router.get('/destacados', (req, res) => {
  try {
    const lotes = db.prepare(`
      SELECT l.*, c.nombre as coleccion_nombre, c.anyo as coleccion_anyo
      FROM lotes l
      JOIN colecciones c ON l.coleccion_id = c.id
      WHERE l.destacado = 1 AND l.vendido = 0
      ORDER BY l.id DESC
    `).all();
    res.json({ ok: true, lotes });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Error al obtener destacados' });
  }
});


// ============================================================
// GET /api/lotes
// ============================================================
// Filtros opcionales por query params:
//   ?coleccion_id=1
//   ?equipo=barcelona
//   ?jugador=messi
//   ?numero_cromo=23
//   ?busqueda=mbappe     ← búsqueda libre (título + jugador + equipo)
//   ?vendido=0           ← 0=disponibles (por defecto), 1=vendidos
// ============================================================
router.get('/', (req, res) => {
  try {
    const { coleccion_id, equipo, jugador, numero_cromo, busqueda, vendido } = req.query;

    // CONCEPTO — Búsqueda combinada:
    // Cuando el usuario escribe en la barra de búsqueda, no
    // sabemos si está buscando un jugador, un equipo o un título.
    // Por eso buscamos el texto en TODOS los campos relevantes
    // a la vez usando OR. Así "Messi Barcelona" encuentra cromos
    // donde "Messi" aparezca en título/jugador Y "Barcelona" en equipo.
    let sql      = `
      SELECT l.*, c.nombre as coleccion_nombre, c.anyo as coleccion_anyo
      FROM lotes l
      JOIN colecciones c ON l.coleccion_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (coleccion_id) {
      sql += ' AND l.coleccion_id = ?';
      params.push(coleccion_id);
    }

    if (equipo) {
      sql += ' AND LOWER(l.equipo) LIKE ?';
      params.push(`%${equipo.toLowerCase()}%`);
    }

    if (jugador) {
      sql += ' AND LOWER(l.jugador) LIKE ?';
      params.push(`%${jugador.toLowerCase()}%`);
    }

    if (numero_cromo) {
      sql += ' AND l.numero_cromo = ?';
      params.push(numero_cromo);
    }

    // Búsqueda libre: busca en título, jugador, equipo Y nombre de colección
    if (busqueda) {
      const termino = `%${busqueda.toLowerCase()}%`;
      sql += ` AND (
        LOWER(l.titulo)        LIKE ? OR
        LOWER(l.jugador)       LIKE ? OR
        LOWER(l.equipo)        LIKE ? OR
        LOWER(c.nombre)        LIKE ?
      )`;
      params.push(termino, termino, termino, termino);
    }

    const estadoVendido = vendido !== undefined ? parseInt(vendido) : 0;
    sql += ' AND l.vendido = ?';
    params.push(estadoVendido);

    if (coleccion_id) {
      sql += " ORDER BY CASE WHEN l.numero_cromo IS NULL OR l.numero_cromo = '' THEN 1 ELSE 0 END ASC, CAST(l.numero_cromo AS INTEGER) ASC";
    } else {
      sql += ' ORDER BY l.creado_en DESC';
    }

    const lotes = db.prepare(sql).all(...params);
    res.json({ ok: true, total: lotes.length, lotes });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Error al obtener lotes' });
  }
});


// ============================================================
// GET /api/lotes/:id
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const lote = db.prepare(`
      SELECT l.*, c.nombre as coleccion_nombre, c.anyo as coleccion_anyo
      FROM lotes l
      JOIN colecciones c ON l.coleccion_id = c.id
      WHERE l.id = ?
    `).get(req.params.id);

    if (!lote) return res.status(404).json({ ok: false, error: 'Lote no encontrado' });
    res.json({ ok: true, lote });

  } catch (error) {
    res.status(500).json({ ok: false, error: 'Error al obtener el lote' });
  }
});


// ============================================================
// POST /api/lotes
// ============================================================
// Crea un lote individual.
// Body esperado (JSON):
// {
//   "coleccion_id": 1,
//   "titulo": "Messi",
//   "jugador": "Lionel Messi",
//   "equipo": "FC Barcelona",
//   "numero_cromo": "1",
//   "precio": 5.50,
//   "descripcion": "Buen estado"
// }
// ============================================================
router.post('/', (req, res) => {
  try {
    const { coleccion_id, titulo, jugador, equipo, numero_cromo, precio, descripcion, imagen_url } = req.body;

    if (!coleccion_id || !titulo || precio === undefined) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios: coleccion_id, titulo, precio' });
    }

    // COMPROBACIÓN DE DUPLICADO:
    // Mismo título + mismo precio + misma colección = duplicado
    const existe = db.prepare(`
      SELECT id FROM lotes
      WHERE LOWER(titulo) = LOWER(?) AND precio = ? AND coleccion_id = ?
    `).get(titulo, precio, coleccion_id);

    if (existe) {
      return res.status(409).json({
        ok: false,
        error: 'Duplicado: ya existe un lote con ese título y precio en esta colección',
        lote_existente_id: existe.id
      });
    }

    const resultado = db.prepare(`
      INSERT INTO lotes (coleccion_id, titulo, jugador, equipo, numero_cromo, precio, descripcion, imagen_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(coleccion_id, titulo, jugador || null, equipo || null, numero_cromo || null, precio, descripcion || null, imagen_url || null);

    // Actualizamos la caché de equipos automáticamente
    if (equipo) {
      db.prepare(`
        INSERT OR IGNORE INTO equipos (coleccion_id, equipo) VALUES (?, ?)
      `).run(coleccion_id, equipo);
    }

    res.status(201).json({ ok: true, mensaje: 'Lote creado correctamente', id: resultado.lastInsertRowid });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Error al crear el lote' });
  }
});


// ============================================================
// PUT /api/lotes/:id
// ============================================================
router.put('/:id', (req, res) => {
  try {
    const lote = db.prepare('SELECT * FROM lotes WHERE id = ?').get(req.params.id);
    if (!lote) return res.status(404).json({ ok: false, error: 'Lote no encontrado' });

    const { titulo, jugador, equipo, numero_cromo, precio, descripcion, imagen_url, vendido } = req.body;

    db.prepare(`
      UPDATE lotes SET
        titulo       = COALESCE(?, titulo),
        jugador      = COALESCE(?, jugador),
        equipo       = COALESCE(?, equipo),
        numero_cromo = COALESCE(?, numero_cromo),
        precio       = COALESCE(?, precio),
        descripcion  = COALESCE(?, descripcion),
        imagen_url   = COALESCE(?, imagen_url),
        vendido      = COALESCE(?, vendido)
      WHERE id = ?
    `).run(titulo, jugador, equipo, numero_cromo, precio, descripcion, imagen_url, vendido, req.params.id);

    if (equipo && equipo !== lote.equipo) {
      db.prepare('INSERT OR IGNORE INTO equipos (coleccion_id, equipo) VALUES (?, ?)').run(lote.coleccion_id, equipo);
    }

    res.json({ ok: true, mensaje: 'Lote actualizado correctamente' });

  } catch (error) {
    res.status(500).json({ ok: false, error: 'Error al actualizar el lote' });
  }
});


// ============================================================
// DELETE /api/lotes/:id
// ============================================================
router.delete('/:id', (req, res) => {
  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const resultado = db.prepare('DELETE FROM lotes WHERE id = ?').run(req.params.id);
    if (resultado.changes === 0) return res.status(404).json({ ok: false, error: 'Lote no encontrado' });
    res.json({ ok: true, mensaje: 'Lote eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Error al eliminar el lote' });
  }
});


// ============================================================
// POST /api/lotes/:id/destacar
// ============================================================
router.post('/:id/destacar', (req, res) => {
  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const lote = db.prepare('SELECT destacado FROM lotes WHERE id = ?').get(req.params.id);
    if (!lote) return res.status(404).json({ ok: false, error: 'Lote no encontrado' });
    const nuevoValor = lote.destacado ? 0 : 1;
    db.prepare('UPDATE lotes SET destacado = ? WHERE id = ?').run(nuevoValor, req.params.id);
    res.json({ ok: true, destacado: nuevoValor });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Error al destacar el lote' });
  }
});


module.exports = router;
