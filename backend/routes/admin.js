// ============================================================
// routes/admin.js
// ============================================================
// Fotomatón con soporte de imágenes.
//
// El administrador sube DOS archivos a la vez:
//   - excel:    el archivo .xlsx con los datos de los lotes
//   - imagenes: un archivo .zip con todas las fotos
//
// Un lote SIN imagen encontrada en el .zip se rechaza y se
// anota en el log .txt. No se sube nada a medias.
//
// CONCEPTO — unzipper:
//   Librería para descomprimir archivos .zip en Node.js.
//   Extraemos las imágenes del zip a una carpeta temporal
//   y luego las movemos a su destino final si el lote es válido.
// ============================================================

const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const XLSX       = require('xlsx');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const unzipper   = require('unzipper');
const sharp      = require('sharp');
const cloudinary = require('../cloudinary');
const db         = require('../database');

// Tamaño máximo al que se redimensionan las imágenes (lado más largo)
const IMG_MAX_PX  = 1200;
// Calidad JPEG de salida (0-100)
const IMG_QUALITY = 82;


// ============================================================
// CONFIGURACIÓN DE MULTER
// ============================================================
// Aceptamos dos archivos en la misma petición:
//   campo "excel"    → .xlsx
//   campo "imagenes" → .zip
// ============================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'temp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage });


// ============================================================
// FUNCIÓN: extraerAnyo
// ============================================================
function extraerAnyo(nombreColeccion) {
  const match = nombreColeccion.match(/(\d{4}-\d{2,4}|\d{4})/);
  return match ? match[1] : null;
}


// ============================================================
// FUNCIÓN: obtenerOCrearColeccion
// ============================================================
function obtenerOCrearColeccion(nombre) {
  const nombreLimpio = nombre.trim();
  let coleccion = db.prepare(
    'SELECT * FROM colecciones WHERE LOWER(nombre) = LOWER(?)'
  ).get(nombreLimpio);

  if (!coleccion) {
    const anyo      = extraerAnyo(nombreLimpio);
    const resultado = db.prepare(
      'INSERT INTO colecciones (nombre, anyo) VALUES (?, ?)'
    ).run(nombreLimpio, anyo);
    coleccion = { id: resultado.lastInsertRowid, nombre: nombreLimpio, anyo };
    console.log(`  📁 Nueva colección creada: "${nombreLimpio}" (año: ${anyo})`);
  }

  return coleccion;
}


// ============================================================
// FUNCIÓN: subirACloudinary
// ============================================================
// Comprime la imagen con sharp y la sube a Cloudinary.
// Devuelve la URL pública permanente de la imagen.
// ============================================================
async function subirACloudinary(rutaOrigen) {
  // Comprimimos a un buffer en memoria antes de subir
  const buffer = await sharp(rutaOrigen)
    .rotate()
    .resize(IMG_MAX_PX, IMG_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: IMG_QUALITY, progressive: true })
    .toBuffer();

  // Subimos el buffer a Cloudinary
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'topcollectors', resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}


// ============================================================
// FUNCIÓN: descomprimirZip
// ============================================================
// Extrae todas las imágenes del .zip a una carpeta temporal.
// Devuelve un Map con { nombreArchivo → rutaCompleta }.
// Así podemos buscar imágenes por nombre de forma instantánea.
// ============================================================
function descomprimirZip(rutaZip, dirDestino) {
  return new Promise((resolve, reject) => {
    const imagenes = new Map();

    if (!fs.existsSync(dirDestino)) fs.mkdirSync(dirDestino, { recursive: true });

    fs.createReadStream(rutaZip)
      .pipe(unzipper.Parse())
      .on('entry', (entry) => {
        const nombreArchivo = path.basename(entry.path); // solo el nombre, sin carpetas
        const extension     = path.extname(nombreArchivo).toLowerCase();

        // Solo procesamos imágenes
        const extensionesValidas = ['.jpg', '.jpeg', '.png', '.webp'];
        if (extensionesValidas.includes(extension)) {
          const rutaDestino = path.join(dirDestino, nombreArchivo);
          entry.pipe(fs.createWriteStream(rutaDestino)).on('finish', () => {
            imagenes.set(nombreArchivo.toLowerCase(), rutaDestino);
          });
        } else {
          entry.autodrain(); // descartamos archivos que no sean imágenes
        }
      })
      .on('close', () => resolve(imagenes))
      .on('error', reject);
  });
}


// ============================================================
// POST /api/admin/fotomaton
// ============================================================
router.post('/fotomaton', upload.fields([
  { name: 'excel',    maxCount: 1 },
  { name: 'imagenes', maxCount: 1 }
]), async (req, res) => {

  // ---- Autenticación ----
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  // ---- Comprobamos que llegaron los dos archivos ----
  if (!req.files?.excel?.[0]) {
    return res.status(400).json({ ok: false, error: 'Falta el archivo Excel' });
  }
  if (!req.files?.imagenes?.[0]) {
    return res.status(400).json({ ok: false, error: 'Falta el archivo .zip de imágenes' });
  }

  const rutaExcel = req.files.excel[0].path;
  const rutaZip   = req.files.imagenes[0].path;

  // Carpetas de trabajo
  const dirTemp      = path.join(__dirname, '..', 'uploads', 'temp', `extraccion_${Date.now()}`);
  const dirImagenes  = path.join(__dirname, '..', 'uploads', 'imagenes');
  if (!fs.existsSync(dirImagenes)) fs.mkdirSync(dirImagenes, { recursive: true });

  try {
    // --------------------------------------------------------
    // 1. DESCOMPRIMIMOS EL ZIP
    // --------------------------------------------------------
    console.log('📦 Descomprimiendo imágenes...');
    const mapaImagenes = await descomprimirZip(rutaZip, dirTemp);
    console.log(`   → ${mapaImagenes.size} imágenes encontradas en el zip`);

    // --------------------------------------------------------
    // 2. LEEMOS EL EXCEL
    // --------------------------------------------------------
    const workbook = XLSX.readFile(rutaExcel);
    const hoja     = workbook.Sheets[workbook.SheetNames[0]];
    const filas    = XLSX.utils.sheet_to_json(hoja, { defval: '' });

    if (filas.length === 0) {
      return res.status(400).json({ ok: false, error: 'El Excel está vacío' });
    }

    let subidos        = 0;
    let rechazados     = 0;
    const logRechazados = [];

    // --------------------------------------------------------
    // 3. PROCESAMOS CADA FILA
    // --------------------------------------------------------
    for (const [indice, fila] of filas.entries()) {
      const numeroFila = indice + 2;

      const coleccionNombre = String(fila['coleccion']    || '').trim();
      const titulo          = String(fila['titulo']       || '').trim();
      const jugador         = String(fila['jugador']      || '').trim();
      const equipo          = String(fila['equipo']       || '').trim();
      const numerocromo     = String(fila['numero_cromo'] || '').trim();
      const precio          = parseFloat(fila['precio'])  || 0;
      const descripcion     = String(fila['descripcion']  || '').trim();
      const imagenNombre    = String(fila['imagen']       || '').trim();

      // ---- Validación: campos obligatorios ----
      if (!coleccionNombre || !titulo || !precio) {
        rechazados++;
        logRechazados.push({
          fila: numeroFila,
          datos: { coleccion: coleccionNombre, titulo, precio },
          motivo: 'Faltan campos obligatorios (coleccion, titulo o precio)'
        });
        continue;
      }

      // ---- Validación: imagen obligatoria ----
      if (!imagenNombre) {
        rechazados++;
        logRechazados.push({
          fila: numeroFila,
          datos: { coleccion: coleccionNombre, titulo },
          motivo: 'Falta el nombre de la imagen en la columna "imagen"'
        });
        continue;
      }

      // ---- Buscamos la imagen en el zip (sin sensibilidad a mayúsculas) ----
      const imagenEncontrada = mapaImagenes.get(imagenNombre.toLowerCase());
      if (!imagenEncontrada) {
        rechazados++;
        logRechazados.push({
          fila: numeroFila,
          datos: { coleccion: coleccionNombre, titulo, imagen: imagenNombre },
          motivo: `Imagen no encontrada en el zip: "${imagenNombre}"`
        });
        continue;
      }

      // ---- Comprobación de duplicado ----
      const coleccion = obtenerOCrearColeccion(coleccionNombre);
      const existe    = db.prepare(`
        SELECT id FROM lotes
        WHERE LOWER(titulo) = LOWER(?) AND precio = ? AND coleccion_id = ?
      `).get(titulo, precio, coleccion.id);

      if (existe) {
        rechazados++;
        logRechazados.push({
          fila: numeroFila,
          datos: { coleccion: coleccionNombre, titulo, precio },
          motivo: `Duplicado (ya existe el lote con id ${existe.id})`
        });
        continue;
      }

      // ---- Todo válido: comprimimos y subimos a Cloudinary ----
      const imagenUrl = await subirACloudinary(imagenEncontrada);

      // ---- Insertamos el lote ----
      db.prepare(`
        INSERT INTO lotes (coleccion_id, titulo, jugador, equipo, numero_cromo, precio, descripcion, imagen_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        coleccion.id,
        titulo,
        jugador     || null,
        equipo      || null,
        numerocromo || null,
        precio,
        descripcion || null,
        imagenUrl
      );

      // ---- Actualizamos caché de equipos ----
      if (equipo) {
        db.prepare(
          'INSERT OR IGNORE INTO equipos (coleccion_id, equipo) VALUES (?, ?)'
        ).run(coleccion.id, equipo);
      }

      subidos++;
    }

    // --------------------------------------------------------
    // 4. GENERAMOS EL LOG DE RECHAZADOS
    // --------------------------------------------------------
    let nombreLog = null;
    if (logRechazados.length > 0) {
      const dirLogs = path.join(__dirname, '..', 'uploads', 'logs');
      if (!fs.existsSync(dirLogs)) fs.mkdirSync(dirLogs, { recursive: true });

      nombreLog       = `rechazados_${Date.now()}.txt`;
      const rutaLog   = path.join(dirLogs, nombreLog);

      const contenido = logRechazados.map(r =>
        `Fila ${r.fila} | Motivo: ${r.motivo}\n  Datos: ${JSON.stringify(r.datos)}`
      ).join('\n\n');

      fs.writeFileSync(
        rutaLog,
        `LOTES RECHAZADOS — ${new Date().toLocaleString('es-ES')}\n${'='.repeat(60)}\n\n${contenido}\n`
      );

      console.log(`  ⚠️  Log guardado: ${rutaLog}`);
    }

    // --------------------------------------------------------
    // 5. LIMPIEZA DE ARCHIVOS TEMPORALES
    // --------------------------------------------------------
    // Borramos el Excel, el zip y la carpeta de extracción
    // temporal para no acumular basura en el servidor.
    // --------------------------------------------------------
    try {
      fs.unlinkSync(rutaExcel);
      fs.unlinkSync(rutaZip);
      fs.rmSync(dirTemp, { recursive: true, force: true });
    } catch (e) {
      console.warn('Aviso: no se pudieron borrar algunos archivos temporales', e.message);
    }

    // --------------------------------------------------------
    // 6. RESPUESTA FINAL
    // --------------------------------------------------------
    res.json({
      ok: true,
      resumen: {
        total_filas:    filas.length,
        subidos,
        rechazados,
        log_rechazados: nombreLog
          ? `Revisa el archivo: uploads/logs/${nombreLog}`
          : 'Sin rechazados ✅'
      }
    });

  } catch (error) {
    console.error('Error en Fotomatón:', error);
    res.status(500).json({ ok: false, error: 'Error al procesar los archivos' });
  }
});


// ============================================================
// POST /api/admin/fix-orientacion
// ============================================================
// Añade a_90 a todas las URLs de Cloudinary para corregir
// la orientación de las imágenes subidas desde móvil.
// Ejecutar una sola vez.
// ============================================================
router.post('/fix-orientacion', (req, res) => {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  const result = db.prepare(`
    UPDATE lotes
    SET imagen_url = REPLACE(imagen_url, '/image/upload/', '/image/upload/a_90/')
    WHERE imagen_url LIKE '%cloudinary%'
    AND imagen_url NOT LIKE '%a_90%'
  `).run();
  res.json({ ok: true, actualizados: result.changes });
});


// ============================================================
// POST /api/admin/quitar-orientacion
// ============================================================
router.post('/quitar-orientacion', (req, res) => {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  const result = db.prepare(`
    UPDATE lotes
    SET imagen_url = REPLACE(imagen_url, '/image/upload/a_90/', '/image/upload/')
    WHERE imagen_url LIKE '%a_90%'
  `).run();
  res.json({ ok: true, actualizados: result.changes });
});


// ============================================================
// POST /api/admin/fix-exif
// ============================================================
router.post('/fix-exif', (req, res) => {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  const result = db.prepare(`
    UPDATE lotes
    SET imagen_url = REPLACE(imagen_url, '/image/upload/', '/image/upload/a_exif/')
    WHERE imagen_url LIKE '%cloudinary%'
    AND imagen_url NOT LIKE '%a_exif%'
  `).run();
  res.json({ ok: true, actualizados: result.changes });
});


// ============================================================
// GET /api/admin/verify
// ============================================================
// Endpoint ligero para verificar la contraseña desde el frontend.
// Devuelve 200 si es correcta, 401 si no.
// ============================================================
router.get('/verify', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  res.json({ ok: true });
});


// ============================================================
// POST /api/admin/recomprimir
// ============================================================
// Recomprime todas las imágenes ya subidas en uploads/imagenes/.
// Útil para reducir el tamaño de imágenes subidas antes de
// añadir la compresión automática.
// ============================================================
router.post('/recomprimir', async (req, res) => {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  const dirImagenes = path.join(__dirname, '..', 'uploads', 'imagenes');
  const extensiones = ['.jpg', '.jpeg', '.png', '.webp'];

  try {
    const archivos = fs.readdirSync(dirImagenes).filter(f =>
      extensiones.includes(path.extname(f).toLowerCase())
    );

    let procesadas = 0;
    let errores    = 0;

    for (const archivo of archivos) {
      const ruta = path.join(dirImagenes, archivo);
      try {
        // Subimos a Cloudinary
        const urlNueva = await subirACloudinary(ruta);

        // Actualizamos todos los lotes que apuntaban a esta imagen local
        const urlLocal = `/imagenes/${archivo}`;
        db.prepare('UPDATE lotes SET imagen_url = ? WHERE imagen_url = ?')
          .run(urlNueva, urlLocal);

        // Borramos el archivo local
        fs.unlinkSync(ruta);
        procesadas++;
        console.log(`  ✅ Migrada: ${archivo}`);
      } catch (e) {
        console.error(`  ❌ Error con ${archivo}:`, e.message);
        errores++;
      }
    }

    res.json({
      ok: true,
      resumen: { total: archivos.length, procesadas, errores }
    });

  } catch (error) {
    console.error('Error al migrar:', error);
    res.status(500).json({ ok: false, error: 'Error al migrar imágenes' });
  }
});


// ============================================================
// POST /api/admin/upload-db
// ============================================================
// Endpoint temporal para subir el SQLite local a Railway.
// Recibe el archivo bajo el campo "database".
// ============================================================
const uploadDb = multer({ storage: multer.memoryStorage() });

router.post('/upload-db', uploadDb.single('database'), (req, res) => {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'Falta el archivo database' });
  }

  const destino = path.join(__dirname, '..', 'db', 'tienda.sqlite');
  // Cerramos la conexión actual, reemplazamos el archivo y salimos
  // Railway reiniciará el proceso automáticamente
  db.close();
  fs.writeFileSync(destino, req.file.buffer);
  res.json({ ok: true, mensaje: 'Base de datos reemplazada. Reiniciando...' });
  setTimeout(() => process.exit(0), 500);
});


// ============================================================
// POST /api/admin/sql
// ============================================================
router.post('/sql', (req, res) => {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  const { query } = req.body;
  if (!query) return res.status(400).json({ ok: false, error: 'Falta query' });
  try {
    const result = db.prepare(query).run();
    res.json({ ok: true, changes: result.changes });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ============================================================
// GET /api/admin/diagnostico
// ============================================================
router.get('/diagnostico', (req, res) => {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  const dbPath = path.join(__dirname, '..', 'db', 'tienda.sqlite');
  const existe = fs.existsSync(dbPath);
  const tamano = existe ? fs.statSync(dbPath).size : 0;
  const lotes  = db.prepare('SELECT COUNT(*) as n FROM lotes').get().n;
  res.json({ ok: true, dbPath, existe, tamano, lotes });
});


// ============================================================
// GET /api/admin
// ============================================================
router.get('/', (req, res) => {
  res.json({
    ok: true,
    endpoints: {
      verify:      'GET  /api/admin/verify       (cabecera: x-admin-password)',
      fotomaton:   'POST /api/admin/fotomaton     (cabecera: x-admin-password, campos: excel + imagenes)',
      recomprimir: 'POST /api/admin/recomprimir  (cabecera: x-admin-password)'
    }
  });
});


module.exports = router;
