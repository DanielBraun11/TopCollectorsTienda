// ============================================================
// server.js
// ============================================================
// Este es el PUNTO DE ENTRADA del backend. Cuando ejecutas
// "node server.js" (o "npm run dev"), Node.js empieza aquí.
//
// CONCEPTO — Express:
//   Express es un framework minimalista para crear servidores
//   HTTP en Node.js. Sin él tendrías que gestionar a mano
//   cabeceras, rutas, métodos… Express lo simplifica mucho.
//
// CONCEPTO — Middleware:
//   Son funciones que se ejecutan ENTRE que llega una petición
//   y que el servidor responde. Por ejemplo: parsear el JSON
//   del body, gestionar CORS, autenticar al usuario…
//   Se registran con app.use(...)
// ============================================================

require('dotenv').config();           // Carga variables de entorno desde .env
const express = require('express');
const cors    = require('cors');
const path    = require('path');

// Inicializamos la base de datos al arrancar (crea tablas si no existen)
require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;


// ============================================================
// MIDDLEWARES GLOBALES
// ============================================================

// CORS: permite que el frontend (que corre en otro origen,
// por ejemplo localhost:5500) pueda hacer peticiones a este
// servidor (localhost:3000). Sin esto el navegador las bloquea.
app.use(cors());

// Parsea el body de las peticiones como JSON.
// Sin esto, req.body estaría siempre vacío en POST/PUT.
app.use(express.json());

// Sirve archivos estáticos (imágenes subidas de los lotes)
// desde la carpeta uploads/imagenes/
// → accesibles en http://localhost:3000/imagenes/foto.jpg
app.use('/imagenes', express.static(path.join(__dirname, 'uploads', 'imagenes')));


// ============================================================
// RUTAS (ENDPOINTS DE LA API)
// ============================================================
// Separamos las rutas en archivos distintos para mantener
// el código limpio. Cada archivo gestiona un "recurso".
//
// CONCEPTO — Prefijo de ruta:
//   app.use('/api/lotes', rutasLotes) significa que todas las
//   rutas definidas en rutasLotes.js empezarán por /api/lotes
//   Ej: GET /api/lotes, POST /api/lotes, GET /api/lotes/5 …
// ============================================================

const rutasLotes      = require('./routes/lotes');
const rutasColecciones = require('./routes/colecciones');
const rutasAdmin      = require('./routes/admin');

app.use('/api/lotes',       rutasLotes);
app.use('/api/colecciones', rutasColecciones);
app.use('/api/admin',       rutasAdmin);


// ============================================================
// RUTA DE SALUD (health check)
// ============================================================
// Es una convención. Un GET a /api/health te dice si el
// servidor está vivo. Útil para debugging y en el futuro
// para servicios de monitorización.
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mensaje: 'Servidor funcionando correctamente' });
});


// ============================================================
// ARRANQUE DEL SERVIDOR
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   → API disponible en http://localhost:${PORT}/api`);
});
