// ============================================================
// app.js — Lógica de la tienda pública
// ============================================================

const API = 'https://topcollectorstienda-production.up.railway.app/api';

// ---- Estado de la app ----
const estado = {
  colecciones:     [],
  coleccionActiva: null,
  equipoActivo:    null,
  busqueda:        '',
  modosBusqueda:   false,
  esAdmin:         !!sessionStorage.getItem('tc_admin_pw'),
  adminPw:         sessionStorage.getItem('tc_admin_pw') || '',
};


// ---- Refs DOM ----
const $coleccionesList    = document.getElementById('colecciones-list');
const $equiposPanel       = document.getElementById('equipos-panel');
const $equiposList        = document.getElementById('equipos-list');
const $equipoSearch       = document.getElementById('equipo-search');
const $grid               = document.getElementById('lotes-grid');
const $contador           = document.getElementById('contador');
const $tituloPrincipal    = document.getElementById('titulo-principal');
const $subtitulo          = document.getElementById('subtitulo');
const $searchInput        = document.getElementById('search-input');
const $searchClear        = document.getElementById('search-clear');
const $searchTexto        = document.getElementById('search-texto');
const $btnTodos           = document.getElementById('btn-todos');
const $modal              = document.getElementById('modal');
const $modalContenido     = document.getElementById('modal-contenido');
const $seccionDestacados  = document.getElementById('seccion-destacados');
const $destacadosGrid     = document.getElementById('destacados-grid');


// ============================================================
// INICIO
// ============================================================
async function init() {
  await cargarColecciones();
  cargarDestacados();
  cargarLotes();
}


// ============================================================
// DESTACADOS
// ============================================================
async function cargarDestacados() {
  try {
    const res  = await fetch(`${API}/lotes/destacados`);
    const data = await res.json();
    const lotes = data.lotes || [];
    if (lotes.length === 0) {
      $seccionDestacados.hidden = true;
      return;
    }
    $seccionDestacados.hidden = false;
    $destacadosGrid.innerHTML = lotes.map(l => cardHTML(l)).join('');
  } catch {
    $seccionDestacados.hidden = true;
  }
}


// ============================================================
// COLECCIONES
// ============================================================
async function cargarColecciones() {
  try {
    const res  = await fetch(`${API}/colecciones`);
    const data = await res.json();
    estado.colecciones = data.colecciones || [];
    renderColecciones();
  } catch {
    $coleccionesList.innerHTML = '<li class="panel__empty">Error al cargar colecciones</li>';
  }
}

function renderColecciones() {
  if (estado.colecciones.length === 0) {
    $coleccionesList.innerHTML = '<li class="panel__empty">Sin colecciones</li>';
    return;
  }

  $coleccionesList.innerHTML = estado.colecciones.map(c => `
    <li class="panel__item">
      <button
        class="panel__btn ${estado.coleccionActiva?.id === c.id ? 'active' : ''}"
        data-id="${c.id}"
        onclick="seleccionarColeccion(${c.id})"
      >
        <span class="panel__btn-name">${c.nombre}</span>
        <span class="panel__btn-badge">${c.total_lotes}</span>
      </button>
    </li>
  `).join('');
}


// ============================================================
// SELECCIONAR COLECCIÓN
// ============================================================
async function seleccionarColeccion(id) {
  if (estado.coleccionActiva?.id === id) {
    // Segundo click: deselecciona
    estado.coleccionActiva = null;
    estado.equipoActivo    = null;
    $equiposPanel.hidden   = true;
    renderColecciones();
    actualizarTitulo();
    cargarLotes();
    return;
  }

  estado.coleccionActiva = estado.colecciones.find(c => c.id === id);
  estado.equipoActivo    = null;
  renderColecciones();

  // Cargar equipos de esta colección
  try {
    const res  = await fetch(`${API}/colecciones/${id}`);
    const data = await res.json();
    if (data.coleccion.equipos && data.coleccion.equipos.length > 0) {
      renderEquipos(data.coleccion.equipos);
      $equiposPanel.hidden = false;
    } else {
      $equiposPanel.hidden = true;
    }
  } catch {
    $equiposPanel.hidden = true;
  }

  actualizarTitulo();
  cargarLotes();
}


// ============================================================
// EQUIPOS
// ============================================================
function renderEquipos(equipos) {
  $equiposList.innerHTML = equipos.map(e => `
    <li class="panel__item">
      <button
        class="panel__btn ${estado.equipoActivo === e ? 'active' : ''}"
        onclick="seleccionarEquipo('${e.replace(/'/g, "\\'")}')"
      >
        <span class="panel__btn-name">${e}</span>
      </button>
    </li>
  `).join('');
}

function seleccionarEquipo(equipo) {
  if (estado.equipoActivo === equipo) {
    estado.equipoActivo = null;
  } else {
    estado.equipoActivo = equipo;
  }
  // Re-renderizar solo los botones de equipo para actualizar el active
  const btns = $equiposList.querySelectorAll('.panel__btn');
  btns.forEach(btn => {
    const esActivo = btn.textContent.trim() === estado.equipoActivo;
    btn.classList.toggle('active', esActivo);
  });
  actualizarTitulo();
  cargarLotes();
}

// Búsqueda dentro del panel de equipos
$equipoSearch?.addEventListener('input', async () => {
  if (!estado.coleccionActiva) return;
  const q = $equipoSearch.value.trim();
  try {
    const url  = `${API}/colecciones/${estado.coleccionActiva.id}/equipos${q ? `?busqueda=${encodeURIComponent(q)}` : ''}`;
    const res  = await fetch(url);
    const data = await res.json();
    renderEquipos(data.equipos || []);
  } catch {}
});


// ============================================================
// BÚSQUEDA GLOBAL
// ============================================================
document.getElementById('search-form')?.addEventListener('submit', e => {
  e.preventDefault();
  const q = $searchInput.value.trim();
  if (!q) return;
  estado.busqueda        = q;
  estado.coleccionActiva = null;
  estado.equipoActivo    = null;
  renderColecciones();
  $equiposPanel.hidden   = true;
  $searchClear.classList.add('visible');
  $searchTexto.textContent = `"${q}"`;
  actualizarTitulo();
  cargarLotes();
});

$searchClear?.addEventListener('click', () => {
  limpiarBusqueda();
});

function limpiarBusqueda() {
  estado.busqueda = '';
  $searchInput.value = '';
  $searchClear.classList.remove('visible');
  actualizarTitulo();
  cargarLotes();
}

$btnTodos?.addEventListener('click', () => {
  estado.coleccionActiva = null;
  estado.equipoActivo    = null;
  estado.busqueda        = '';
  $searchInput.value     = '';
  $searchClear.classList.remove('visible');
  $equiposPanel.hidden   = true;
  renderColecciones();
  actualizarTitulo();
  cargarLotes();
});


// ============================================================
// CARGAR LOTES
// ============================================================
async function cargarLotes() {
  mostrarCargando();

  const params = new URLSearchParams();
  if (estado.coleccionActiva) params.set('coleccion_id', estado.coleccionActiva.id);
  if (estado.equipoActivo)    params.set('equipo', estado.equipoActivo);
  if (estado.busqueda)        params.set('busqueda', estado.busqueda);

  try {
    const res  = await fetch(`${API}/lotes?${params}`);
    const data = await res.json();
    renderLotes(data.lotes || [], data.total || 0);
  } catch {
    $grid.innerHTML = `
      <div class="estado">
        <div class="estado__icono">⚠️</div>
        <div class="estado__texto">No se pudo conectar con el servidor</div>
        <div class="estado__sub">Asegúrate de que el backend está corriendo en localhost:3000</div>
      </div>`;
  }
}

function mostrarCargando() {
  $grid.innerHTML = `
    <div class="estado">
      <div class="spinner"></div>
      <div class="estado__texto">Cargando lotes…</div>
    </div>`;
}

function renderLotes(lotes, total) {
  $contador.innerHTML = `<span>${total}</span> lote${total !== 1 ? 's' : ''}`;

  if (lotes.length === 0) {
    $grid.innerHTML = `
      <div class="estado">
        <div class="estado__icono">🔍</div>
        <div class="estado__texto">No se encontraron lotes</div>
        <div class="estado__sub">Prueba con otro filtro o búsqueda</div>
      </div>`;
    return;
  }

  $grid.innerHTML = lotes.map(l => cardHTML(l)).join('');
}

function cardHTML(l) {
  return `
    <div class="card" id="card-${l.id}" onclick="abrirModal(${l.id})">
      ${estado.esAdmin ? `
        <div class="card__admin-btns" onclick="event.stopPropagation()">
          <button class="card__admin-btn card__admin-btn--star ${l.destacado ? 'activo' : ''}"
            onclick="toggleDestacado(${l.id}, this)" title="Destacar">⭐</button>
          <button class="card__admin-btn card__admin-btn--delete"
            onclick="borrarLote(${l.id})" title="Eliminar">✕</button>
        </div>` : ''}
      <div class="card__img-wrap">
        ${l.imagen_url
          ? `<img class="card__img" src="${l.imagen_url}" alt="${escHtml(l.titulo)}" loading="lazy">`
          : `<div class="card__img-placeholder">🖼️</div>`}
        ${l.numero_cromo ? `<span class="card__numero">#${escHtml(l.numero_cromo)}</span>` : ''}
      </div>
      <div class="card__body">
        <div class="card__coleccion">${escHtml(l.coleccion_nombre)}</div>
        <div class="card__titulo">${escHtml(l.titulo)}</div>
        ${l.jugador ? `<div class="card__jugador">${escHtml(l.jugador)}</div>` : ''}
        ${l.equipo  ? `<div class="card__equipo">⚽ ${escHtml(l.equipo)}</div>` : ''}
        <div class="card__precio">${formatPrecio(l.precio)}</div>
      </div>
    </div>
  `;
}


// ============================================================
// TÍTULO DINÁMICO
// ============================================================
function actualizarTitulo() {
  if (estado.busqueda) {
    $tituloPrincipal.textContent = 'Resultados de búsqueda';
    $subtitulo.textContent       = `Buscando: "${estado.busqueda}"`;
  } else if (estado.equipoActivo && estado.coleccionActiva) {
    $tituloPrincipal.textContent = estado.equipoActivo;
    $subtitulo.textContent       = estado.coleccionActiva.nombre;
  } else if (estado.coleccionActiva) {
    $tituloPrincipal.textContent = estado.coleccionActiva.nombre;
    $subtitulo.textContent       = 'Selecciona un equipo o navega todos los lotes';
  } else {
    $tituloPrincipal.textContent = 'Todos los lotes';
    $subtitulo.textContent       = '';
  }
}


// ============================================================
// MODAL DE DETALLE
// ============================================================
async function abrirModal(id) {
  $modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  $modalContenido.innerHTML = `
    <div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;padding:60px;">
      <div class="spinner"></div>
    </div>`;

  try {
    const res  = await fetch(`${API}/lotes/${id}`);
    const data = await res.json();
    if (!data.ok) throw new Error();
    renderModal(data.lote);
  } catch {
    $modalContenido.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:#888;">Error al cargar el lote</div>`;
  }
}

function renderModal(l) {
  $modalContenido.innerHTML = `
    <div class="modal__img-wrap">
      ${l.imagen_url
        ? `<img class="modal__img" src="${l.imagen_url}" alt="${escHtml(l.titulo)}">`
        : `<div class="card__img-placeholder" style="height:100%;font-size:5rem;">🖼️</div>`}
    </div>
    <div class="modal__body">
      <div class="modal__coleccion">${escHtml(l.coleccion_nombre)}</div>
      <h2 class="modal__titulo">${escHtml(l.titulo)}</h2>
      ${l.jugador ? `<div class="modal__jugador">${escHtml(l.jugador)}</div>` : ''}
      <div class="modal__precio">${formatPrecio(l.precio)}</div>
      <hr class="modal__divider">
      <div class="modal__meta">
        ${l.equipo       ? metaRow('Equipo',     l.equipo)       : ''}
        ${l.numero_cromo ? metaRow('Nº cromo',   l.numero_cromo) : ''}
        ${l.estado       ? metaRow('Estado',     l.estado)       : ''}
        ${l.coleccion_anyo ? metaRow('Temporada', l.coleccion_anyo) : ''}
      </div>
      ${l.descripcion ? `<p class="modal__desc">${escHtml(l.descripcion)}</p>` : ''}
      <div class="modal__contacto">
        ¿Te interesa este cromo?<br>
        Escríbeme a <a href="mailto:danielbraunsandino@gmail.com">danielbraunsandino@gmail.com</a>
      </div>
    </div>
  `;
}

function metaRow(label, valor) {
  return `
    <div class="modal__meta-row">
      <span class="modal__meta-label">${label}</span>
      <span class="modal__meta-val">${escHtml(String(valor))}</span>
    </div>`;
}

function cerrarModal() {
  $modal.classList.remove('open');
  document.body.style.overflow = '';
}

$modal?.addEventListener('click', e => {
  if (e.target === $modal) cerrarModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarModal();
});


// ============================================================
// UTILIDADES
// ============================================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPrecio(n) {
  return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}


// ============================================================
// ACCIONES ADMIN
// ============================================================
async function borrarLote(id) {
  if (!confirm('¿Eliminar este lote definitivamente?')) return;
  try {
    const res = await fetch(`${API}/lotes/${id}`, {
      method:  'DELETE',
      headers: { 'x-admin-password': estado.adminPw }
    });
    const data = await res.json();
    if (!data.ok) { alert('Error al eliminar: ' + data.error); return; }
    // Quitar la card del DOM
    document.getElementById(`card-${id}`)?.remove();
    // Recargar destacados por si era uno de ellos
    cargarDestacados();
  } catch {
    alert('Error de conexión al eliminar');
  }
}

async function toggleDestacado(id, btn) {
  try {
    const res = await fetch(`${API}/lotes/${id}/destacar`, {
      method:  'POST',
      headers: { 'x-admin-password': estado.adminPw }
    });
    const data = await res.json();
    if (!data.ok) { alert('Error: ' + data.error); return; }
    btn.classList.toggle('activo', data.destacado === 1);
    cargarDestacados();
  } catch {
    alert('Error de conexión al destacar');
  }
}


// ============================================================
// ARRANQUE
// ============================================================
init();
