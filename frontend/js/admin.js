// ============================================================
// admin.js — Panel fotomatón
// ============================================================

const API = 'http://localhost:3000/api';
const STORAGE_KEY = 'tc_admin_pw';

// ---- Refs DOM ----
const $loginGate   = document.getElementById('login-gate');
const $adminPanel  = document.getElementById('admin-panel');
const $loginInput  = document.getElementById('login-input');
const $loginBtn    = document.getElementById('login-btn');
const $loginError  = document.getElementById('login-error');
const $logoutBtn   = document.getElementById('logout-btn');

const $dropExcel   = document.getElementById('drop-excel');
const $inputExcel  = document.getElementById('input-excel');
const $archivoExcel = document.getElementById('archivo-excel');

const $dropZip     = document.getElementById('drop-zip');
const $inputZip    = document.getElementById('input-zip');
const $archivoZip  = document.getElementById('archivo-zip');

const $btnSubir    = document.getElementById('btn-subir');
const $progressWrap = document.getElementById('progress-wrap');
const $progressFill = document.getElementById('progress-fill');
const $progressTxt  = document.getElementById('progress-txt');
const $resultado   = document.getElementById('resultado');

const $btnRecomprimir       = document.getElementById('btn-recomprimir');
const $resultadoRecomprimir = document.getElementById('resultado-recomprimir');

let password = '';


// ============================================================
// AUTENTICACIÓN
// ============================================================
function init() {
  const guardada = sessionStorage.getItem(STORAGE_KEY);
  if (guardada) {
    password = guardada;
    mostrarPanel();
  }
}

$loginBtn?.addEventListener('click', async () => {
  const pw = $loginInput.value.trim();
  if (!pw) return;

  console.log('Intentando login...');
  try {
    const res = await fetch(`${API}/admin/verify?t=${Date.now()}`, {
      headers: { 'x-admin-password': pw }
    });

    console.log('Respuesta del servidor:', res.status);

    if (res.status === 401) {
      $loginError.classList.add('visible');
      $loginError.textContent = 'Contraseña incorrecta';
      return;
    }

    password = pw;
    sessionStorage.setItem(STORAGE_KEY, pw);
    $loginError.classList.remove('visible');
    mostrarPanel();

  } catch (err) {
    console.error('Error de fetch:', err);
    $loginError.classList.add('visible');
    $loginError.textContent = 'No se pudo conectar con el servidor';
  }
});

$loginInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') $loginBtn.click();
});

document.getElementById('toggle-pw')?.addEventListener('click', () => {
  const esPassword = $loginInput.type === 'password';
  $loginInput.type = esPassword ? 'text' : 'password';
  document.getElementById('toggle-pw').textContent = esPassword ? '🙈' : '👁';
});

$logoutBtn?.addEventListener('click', () => {
  sessionStorage.removeItem(STORAGE_KEY);
  password = '';
  $adminPanel.style.display = 'none';
  $loginGate.style.display  = 'flex';
  $loginInput.value = '';
});

function mostrarPanel() {
  $loginGate.style.display  = 'none';
  $adminPanel.style.display = 'block';
  $adminPanel.removeAttribute('hidden');
}


// ============================================================
// DROP ZONES
// ============================================================
function setupDropZone(zona, input, labelArchivo, tiposAceptados, textoTipo) {
  zona.addEventListener('click', () => input.click());

  zona.addEventListener('dragover', e => {
    e.preventDefault();
    zona.classList.add('drag-over');
  });

  zona.addEventListener('dragleave', () => zona.classList.remove('drag-over'));

  zona.addEventListener('drop', e => {
    e.preventDefault();
    zona.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) asignarArchivo(zona, input, labelArchivo, file, tiposAceptados, textoTipo);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) asignarArchivo(zona, input, labelArchivo, input.files[0], tiposAceptados, textoTipo);
  });
}

function asignarArchivo(zona, input, labelArchivo, file, tiposAceptados, textoTipo) {
  if (!tiposAceptados.some(t => file.name.toLowerCase().endsWith(t))) {
    alert(`Formato no válido. Se esperaba: ${tiposAceptados.join(', ')}`);
    return;
  }
  labelArchivo.textContent = `📎 ${file.name}`;
  zona.classList.add('has-file');
  actualizarBtnSubir();
}

setupDropZone($dropExcel, $inputExcel, $archivoExcel, ['.xlsx', '.xls'], 'Excel');
setupDropZone($dropZip,   $inputZip,   $archivoZip,   ['.zip'],          'ZIP');

function actualizarBtnSubir() {
  const tieneExcel = $inputExcel.files.length > 0;
  const tieneZip   = $inputZip.files.length > 0;
  $btnSubir.disabled = !(tieneExcel && tieneZip);
}


// ============================================================
// SUBIDA AL FOTOMATÓN
// ============================================================
$btnSubir?.addEventListener('click', async () => {
  const excel = $inputExcel.files[0];
  const zip   = $inputZip.files[0];
  if (!excel || !zip) return;

  $btnSubir.disabled = true;
  $resultado.className = 'resultado';
  $progressWrap.classList.add('visible');
  animarProgreso();

  const form = new FormData();
  form.append('excel',    excel);
  form.append('imagenes', zip);

  try {
    const res  = await fetch(`${API}/admin/fotomaton`, {
      method:  'POST',
      headers: { 'x-admin-password': password },
      body:    form
    });

    const data = await res.json();
    pararProgreso();
    mostrarResultado(data);

  } catch (err) {
    pararProgreso();
    mostrarError('Error de conexión con el servidor');
  }
});

// Animación de progreso indeterminada (no tenemos progreso real sin streaming)
let intervaloProgreso = null;

function animarProgreso() {
  $progressFill.style.width = '0%';
  $progressTxt.textContent  = 'Subiendo archivos…';
  let pct = 0;
  intervaloProgreso = setInterval(() => {
    // Sube rápido hasta 80%, luego muy lento (esperamos la respuesta)
    const incremento = pct < 80 ? 3 : 0.3;
    pct = Math.min(pct + incremento, 97);
    $progressFill.style.width = pct + '%';
  }, 120);
}

function pararProgreso() {
  clearInterval(intervaloProgreso);
  $progressFill.style.width = '100%';
  $progressTxt.textContent  = 'Procesado';
  setTimeout(() => $progressWrap.classList.remove('visible'), 800);
}

function mostrarResultado(data) {
  if (!data.ok) {
    mostrarError(data.error || 'Error desconocido');
    return;
  }

  const r = data.resumen;
  $resultado.className = 'resultado ok visible';
  $resultado.innerHTML = `
    <div class="resultado__titulo">✅ Importación completada</div>
    <div class="resultado__stats">
      <div class="stat">
        <div class="stat__num">${r.total_filas}</div>
        <div class="stat__label">Filas procesadas</div>
      </div>
      <div class="stat subidos">
        <div class="stat__num">${r.subidos}</div>
        <div class="stat__label">Lotes subidos</div>
      </div>
      <div class="stat rechazados">
        <div class="stat__num">${r.rechazados}</div>
        <div class="stat__label">Rechazados</div>
      </div>
    </div>
    ${r.rechazados > 0 ? `<div class="resultado__log">⚠️ ${r.log_rechazados}</div>` : ''}
  `;

  // Limpiamos los inputs para la próxima subida
  resetForm();
}

function mostrarError(msg) {
  $resultado.className = 'resultado error visible';
  $resultado.innerHTML = `
    <div class="resultado__titulo">❌ Error en la importación</div>
    <p style="font-size:0.9rem;color:#a93226;">${msg}</p>
  `;
  $btnSubir.disabled = false;
}

function resetForm() {
  $inputExcel.value = '';
  $inputZip.value   = '';
  $dropExcel.classList.remove('has-file');
  $dropZip.classList.remove('has-file');
  $archivoExcel.textContent = '';
  $archivoZip.textContent   = '';
  $btnSubir.disabled = true;
}


// ============================================================
// RECOMPRIMIR IMÁGENES EXISTENTES
// ============================================================
$btnRecomprimir?.addEventListener('click', async () => {
  if (!confirm('¿Recomprimir todas las imágenes existentes? El proceso puede tardar varios minutos.')) return;

  $btnRecomprimir.disabled = true;
  $btnRecomprimir.textContent = '⏳ Recomprimiendo…';
  $resultadoRecomprimir.className = 'resultado';

  try {
    const res  = await fetch(`${API}/admin/recomprimir`, {
      method:  'POST',
      headers: { 'x-admin-password': password }
    });
    const data = await res.json();

    if (!data.ok) throw new Error(data.error);

    const r = data.resumen;
    $resultadoRecomprimir.className = 'resultado ok visible';
    $resultadoRecomprimir.innerHTML = `
      <div class="resultado__titulo">✅ Recompresión completada</div>
      <div class="resultado__stats">
        <div class="stat">
          <div class="stat__num">${r.procesadas}</div>
          <div class="stat__label">Imágenes procesadas</div>
        </div>
        <div class="stat subidos">
          <div class="stat__num">${r.ahorro_mb} MB</div>
          <div class="stat__label">Espacio ahorrado</div>
        </div>
        ${r.errores > 0 ? `<div class="stat rechazados"><div class="stat__num">${r.errores}</div><div class="stat__label">Errores</div></div>` : ''}
      </div>
    `;
  } catch (err) {
    $resultadoRecomprimir.className = 'resultado error visible';
    $resultadoRecomprimir.innerHTML = `<div class="resultado__titulo">❌ Error</div><p style="font-size:0.9rem;color:#a93226;">${err.message}</p>`;
  } finally {
    $btnRecomprimir.disabled = false;
    $btnRecomprimir.innerHTML = '🗜️ Recomprimir imágenes existentes';
  }
});


// ============================================================
// ARRANQUE
// ============================================================
init();
