/* =====================================================================
   Control de tiempos de Diseño + Reposiciones de planchas
   Se carga DESPUÉS de app.js. No cambia nada de lo que ya hace la página:
   solo agrega la barra de diseño, la pestaña de reposiciones y los botones
   de tiempo. Los datos se guardan en el servidor de producción (Node-RED + Postgres).
   ===================================================================== */
(function () {
  'use strict';

  // ---------- Configuración ----------
  const API = window.DISENO_API || 'https://tici.ddns.net:1880/diseno/api';
  const DISENADORES = ['Gilberto', 'Nataly'];
  const MOTIVOS_PAUSA = ['Atender a producción', 'Esperando información del vendedor', 'Esperando aprobación del cliente',
    'Corrección pedida por el cliente', 'Reunión', 'Almuerzo / descanso', 'Problema de equipo o sistema', 'Otro'];
  const OTRAS = ['Atención a vendedores', 'Pruebas de color / muestras', 'Archivo y orden de artes', 'Capacitación'];
  const MOTIVOS_REP = ['Perdió puntos / desgaste', 'Plancha dañada', 'Plancha extraviada', 'Cambio en el arte / texto',
    'Cambio de medida o de máquina', 'Otro'];
  const MAQUINAS = ['SPS4', 'FIT', 'ZTJ330', 'MARKANDY', 'DIGITAL', 'RY-320'];
  const PROPOSITOS = [['SOLO ARTE', 'Solo arte'], ['MUESTRA', 'Para muestra'], ['PRODUCCIÓN', 'Para producción']];
  const CADA_MS = 30000;

  // ---------- Estado ----------
  let yo = leer('uh_disenador');
  if (!DISENADORES.includes(yo)) yo = '';
  let est = null, estAt = 0, conexionOk = true;
  let repos = [], reposVistas = null, verCerradas = false;
  let pausaPendiente = null, envioPendiente = null;
  let tipos = {}, tipoPendiente = null;   // propósito de cada solicitud (UHI → SOLO ARTE / MUESTRA / PRODUCCIÓN)

  function leer(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? ''));
  const $ = id => document.getElementById(id);

  // ---------- Llamadas al servidor ----------
  async function apiGet(ruta) {
    const r = await fetch(API + ruta + (ruta.includes('?') ? '&' : '?') + 't=' + Date.now());
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Error del servidor');
    return j;
  }
  async function apiPost(ruta, cuerpo) {
    // text/plain = petición "simple": el navegador no pide permiso previo (CORS) al servidor
    const r = await fetch(API + ruta, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Error del servidor');
    return j;
  }
  function marcarConexion(ok) {
    conexionOk = ok;
    const el = $('dsConexion');
    if (el) el.classList.toggle('d-none', ok);
  }

  // ---------- Formatos ----------
  function dur(seg) {
    seg = Math.max(0, Math.round(seg || 0));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
  function durCorta(seg) {
    const m = Math.round((seg || 0) / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  }
  function hace(ts) {
    if (!ts) return '';
    const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    return h < 24 ? `hace ${h} h ${m % 60 ? (m % 60) + ' min' : ''}` : `hace ${Math.floor(h / 24)} d`;
  }
  const corriendo = () => (est && est.abiertas || []).find(a => a.evento === 'INICIO');
  const abierta = ref => (est && est.abiertas || []).find(a => a.referencia === ref);
  const segActual = a => a ? (a.seg || 0) + (a.evento === 'INICIO' ? (Date.now() - estAt) / 1000 : 0) : 0;

  // ---------- Interfaz que se agrega a la página ----------
  function montar() {
    const header = document.querySelector('.header-card');
    const tabla = document.querySelector('.table-card');
    if (!header || !tabla) return;

    header.insertAdjacentHTML('afterend', `
<div class="ds-card mb-4" id="dsBarra">
  <div class="ds-quien">
    <span class="text-muted small me-1">¿Quién está en esta computadora?</span>
    ${DISENADORES.map(d => `<button type="button" class="btn btn-sm ds-yo" data-yo="${esc(d)}"><i class="fa-solid fa-user-pen"></i> Soy ${esc(d)}</button>`).join('')}
    <button type="button" class="btn btn-sm ds-yo" data-yo=""><i class="fa-solid fa-user"></i> No soy de diseño</button>
    <span id="dsConexion" class="text-danger small ms-2 d-none"><i class="fa-solid fa-triangle-exclamation"></i> Sin conexión con el registro de tiempos</span>
  </div>
  <div id="dsMiTrabajo" class="d-none"></div>
</div>`);

    tabla.insertAdjacentHTML('beforebegin', `
<ul class="nav nav-pills ds-tabs mb-3" id="dsTabs">
  <li class="nav-item"><button type="button" class="nav-link active" data-tab="artes"><i class="fa-solid fa-palette"></i> Solicitudes de arte</button></li>
  <li class="nav-item"><button type="button" class="nav-link" data-tab="repos"><i class="fa-solid fa-rotate-left"></i> Reposiciones de planchas <span class="badge text-bg-danger ms-1 d-none" id="dsReposBadge">0</span></button></li>
</ul>`);
    tabla.id = tabla.id || 'dsTablaArtes';
    tabla.insertAdjacentHTML('afterend', `
<div class="table-card d-none" id="dsRepos">
  <div class="toolbar mb-3">
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <button type="button" class="btn btn-danger" id="dsBtnNuevaRep"><i class="fa-solid fa-plus"></i> Pedir reposición de plancha</button>
      <button type="button" class="btn btn-outline-secondary" id="dsBtnRepActualizar"><i class="fa-solid fa-rotate"></i> Actualizar</button>
      <div class="form-check ms-2"><input class="form-check-input" type="checkbox" id="dsVerCerradas"><label class="form-check-label small" for="dsVerCerradas">Ver terminadas (15 días)</label></div>
    </div>
    <div class="text-muted small">Producción pide → Diseño revisa (y cambia el arte si hace falta) → Planchas fabrica</div>
  </div>
  <div class="table-responsive">
    <table class="table table-hover align-middle">
      <thead class="table-secondary"><tr><th>Código</th><th>Urgencia</th><th>OP</th><th>UHI</th><th>Máquina</th><th>Motivo</th><th>Pidió</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody id="dsReposBody"></tbody>
    </table>
  </div>
  <div id="dsReposVacio" class="empty-state d-none"><i class="fa-solid fa-circle-check"></i><p class="mb-0">No hay reposiciones pendientes.</p></div>
</div>`);

    document.body.insertAdjacentHTML('beforeend', modales());
    campoPropositoEnFormulario();

    document.querySelectorAll('.ds-yo').forEach(b => b.addEventListener('click', () => elegirYo(b.dataset.yo)));
    document.querySelectorAll('#dsTabs .nav-link').forEach(b => b.addEventListener('click', () => verTab(b.dataset.tab)));
    $('dsBtnNuevaRep').addEventListener('click', abrirNuevaRep);
    $('dsBtnRepActualizar').addEventListener('click', cargarRepos);
    $('dsVerCerradas').addEventListener('change', e => { verCerradas = e.target.checked; pintarRepos(); });
    $('dsFormRep').addEventListener('submit', enviarNuevaRep);
    $('dsBtnConfirmarPausa').addEventListener('click', confirmarPausa);
    $('dsBtnConfirmarOtra').addEventListener('click', confirmarOtra);
    $('dsBtnConfirmarEnvio').addEventListener('click', confirmarEnvio);
    $('dsOtraSel').addEventListener('change', e => $('dsOtraTxt').classList.toggle('d-none', e.target.value !== 'Otra'));
    document.addEventListener('click', clicGlobal);
    pintarYo();
  }

  function modales() {
    const radios = (name, ops, sel) => ops.map((o, i) => `<div class="form-check"><input class="form-check-input" type="radio" name="${name}" id="${name}${i}" value="${esc(o)}" ${o === sel ? 'checked' : ''}><label class="form-check-label" for="${name}${i}">${esc(o)}</label></div>`).join('');
    return `
<div class="modal fade" id="dsModalPausa" tabindex="-1"><div class="modal-dialog ds-modal-sm"><div class="modal-content">
  <div class="modal-header"><h5 class="modal-title"><i class="fa-solid fa-pause"></i> ¿Por qué pausas?</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
  <div class="modal-body"><div class="small text-muted mb-2" id="dsPausaRef"></div>${radios('dsMotivo', MOTIVOS_PAUSA, '')}
    <input id="dsPausaCom" class="form-control mt-2" placeholder="Comentario (opcional)" maxlength="300"></div>
  <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-warning" id="dsBtnConfirmarPausa"><i class="fa-solid fa-pause"></i> Pausar</button></div>
</div></div></div>

<div class="modal fade" id="dsModalOtra" tabindex="-1"><div class="modal-dialog ds-modal-sm"><div class="modal-content">
  <div class="modal-header"><h5 class="modal-title"><i class="fa-solid fa-briefcase"></i> Otra actividad</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
  <div class="modal-body"><p class="small text-muted">Para trabajo que no es un UHI ni una reposición. También se cronometra.</p>
    <select id="dsOtraSel" class="form-select">${OTRAS.map(o => `<option>${esc(o)}</option>`).join('')}<option value="Otra">Otra (escribir)…</option></select>
    <input id="dsOtraTxt" class="form-control mt-2 d-none" placeholder="¿Qué actividad?" maxlength="60"></div>
  <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-primary" id="dsBtnConfirmarOtra"><i class="fa-solid fa-play"></i> Iniciar</button></div>
</div></div></div>

<div class="modal fade" id="dsModalEnvio" tabindex="-1"><div class="modal-dialog ds-modal-sm"><div class="modal-content">
  <div class="modal-header"><h5 class="modal-title"><i class="fa-solid fa-layer-group"></i> Enviar a planchas</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
  <div class="modal-body"><div class="small text-muted mb-2" id="dsEnvioRef"></div>
    <label class="form-label fw-semibold">¿Hubo que cambiar el arte?</label>
    <div class="d-flex gap-3 mb-2">
      <div class="form-check"><input class="form-check-input" type="radio" name="dsCambio" id="dsCambioNo" value="no" checked><label class="form-check-label" for="dsCambioNo">No, sale igual</label></div>
      <div class="form-check"><input class="form-check-input" type="radio" name="dsCambio" id="dsCambioSi" value="si"><label class="form-check-label" for="dsCambioSi">Sí, se modificó</label></div>
    </div>
    <input id="dsEnvioNota" class="form-control" placeholder="Nota para planchas (opcional)" maxlength="300"></div>
  <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-success" id="dsBtnConfirmarEnvio"><i class="fa-solid fa-paper-plane"></i> Enviar a planchas</button></div>
</div></div></div>

<div class="modal fade" id="dsModalRep" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
  <div class="modal-header bg-danger text-white"><h5 class="modal-title"><i class="fa-solid fa-rotate-left"></i> Pedir reposición de plancha</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
  <form id="dsFormRep"><div class="modal-body"><div class="row g-3">
    <div class="col-md-6"><label class="form-label">Solicitado por *</label><input id="dsRepSol" class="form-control" required maxlength="60" placeholder="Nombre y puesto"></div>
    <div class="col-md-3"><label class="form-label">OP</label><input id="dsRepOp" class="form-control" maxlength="30" placeholder="Ej. 12345"></div>
    <div class="col-md-3"><label class="form-label">UHI</label><input id="dsRepUhi" class="form-control" maxlength="30" placeholder="Ej. UHI1234"></div>
    <div class="col-md-4"><label class="form-label">Máquina</label><select id="dsRepMaq" class="form-select"><option value="">Seleccionar</option>${MAQUINAS.map(m => `<option>${m}</option>`).join('')}</select></div>
    <div class="col-md-4"><label class="form-label">Motivo *</label><select id="dsRepMot" class="form-select" required><option value="">Seleccionar</option>${MOTIVOS_REP.map(m => `<option>${esc(m)}</option>`).join('')}</select></div>
    <div class="col-md-4"><label class="form-label">Colores / planchas afectadas</label><input id="dsRepCol" class="form-control" maxlength="120" placeholder="Ej. Magenta y negro"></div>
    <div class="col-12"><label class="form-label">Urgencia</label><div class="d-flex flex-wrap gap-3">${radios('dsRepUrg', ['NORMAL', 'URGENTE', 'MÁQUINA PARADA'], 'NORMAL')}</div></div>
    <div class="col-12"><label class="form-label">Comentario</label><textarea id="dsRepCom" class="form-control" rows="3" maxlength="500" placeholder="¿Qué le pasó a la plancha? ¿Qué hay que cambiar?"></textarea></div>
    <div class="col-12 small text-muted">Se necesita la OP o el UHI. La solicitud le llega primero a Diseño, que la revisa y la pasa a Planchas.</div>
  </div></div>
  <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button><button type="submit" class="btn btn-danger" id="dsBtnGuardarRep"><i class="fa-solid fa-paper-plane"></i> Enviar solicitud</button></div></form>
</div></div></div>`;
  }

  // ---------- Propósito de la solicitud (lo indica ventas) ----------
  const etiquetaProp = p => (PROPOSITOS.find(x => x[0] === p) || [p, p])[1];
  function badgeProp(p) {
    if (!p) return '';
    const c = p === 'PRODUCCIÓN' ? 'ds-prop-prod' : p === 'MUESTRA' ? 'ds-prop-muestra' : 'ds-prop-arte';
    return `<span class="ds-prop ${c}">${esc(etiquetaProp(p))}</span>`;
  }
  function campoPropositoEnFormulario() {
    const ref = $('fechaRequerida');
    const col = ref && ref.closest('[class*="col-"]');
    if (!col || $('dsProposito')) return;
    col.insertAdjacentHTML('afterend', `<div class="col-md-6"><label class="form-label">¿Para qué es el arte? *</label>
      <select id="dsProposito" class="form-select" required><option value="">Seleccionar</option>
      ${PROPOSITOS.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>`);
    // Guardar lo elegido justo antes de que app.js envíe la solicitud a Google Sheets
    $('formSolicitud').addEventListener('submit', () => {
      const v = id => ($(id) || {}).value || '';
      tipoPendiente = { proposito: v('dsProposito'), cliente: v('cliente'), producto: v('producto'), solicitadoPor: v('solicitadoPor') };
    }, true);
  }
  // Cuando Google Sheets devuelve el código nuevo (UHI####), se registra el propósito en el servidor de producción
  function vigilarCreacion() {
    const fetchOrig = window.fetch.bind(window);
    window.fetch = async function (url, opts) {
      const resp = await fetchOrig(url, opts);
      try {
        const esSheets = typeof URL_API_SHEETS !== 'undefined' && String(url).startsWith(URL_API_SHEETS);
        if (esSheets && opts && opts.method === 'POST' && tipoPendiente && /"action":"create"/.test(String(opts.body || ''))) {
          const pend = tipoPendiente; tipoPendiente = null;
          resp.clone().json().then(d => {
            if (!d || d.status !== 'success' || !pend.proposito) return;
            if (d.id) registrarTipo(String(d.id), pend);
            else sinCodigo = { ...pend, hasta: Date.now() + 10 * 60000 };   // se busca al recargar la lista
          }).catch(() => { });
        }
      } catch (e) { }
      return resp;
    };
  }
  let sinCodigo = null;
  function registrarTipo(uhi, pend) {
    tipos[uhi] = pend.proposito;
    apiPost('/solicitudes/tipo', { uhi, origen: 'VENTAS', ...pend }).catch(() => marcarConexion(false));
  }
  // Si la hoja no devolvió el código, se busca la solicitud recién creada por cliente + producto
  function buscarSinCodigo() {
    if (!sinCodigo) return;
    if (Date.now() > sinCodigo.hasta) { sinCodigo = null; return; }
    let lista = []; try { lista = solicitudes || []; } catch (e) { }
    const norm = v => String(v || '').trim().toUpperCase();
    const c = lista.filter(s => s.id && norm(s.cliente) === norm(sinCodigo.cliente) && norm(s.producto) === norm(sinCodigo.producto) && !tipos[String(s.id)])
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
    if (c) { const p = sinCodigo; sinCodigo = null; registrarTipo(String(c.id), p); }
  }
  async function cargarTipos() {
    try { tipos = (await apiGet('/solicitudes/tipos')).tipos || {}; redecorarTabla(); } catch (e) { }
  }
  async function cambiarTipo(uhi, prop) {
    const s = solicitudPorId(uhi) || {};
    try {
      await apiPost('/solicitudes/tipo', { uhi, proposito: prop, origen: yo ? 'DISEÑO' : 'VENTAS', cliente: s.cliente, producto: s.producto, solicitadoPor: s.solicitadoPor });
      tipos[uhi] = prop; redecorarTabla();
      const el = $('dsPropDetalle'); if (el) el.innerHTML = badgeProp(prop);
    } catch (e) { alert('❌ No se pudo guardar: ' + e.message); }
  }

  function verTab(t) {
    document.querySelectorAll('#dsTabs .nav-link').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    const artes = document.querySelector('.table-card:not(#dsRepos)');
    if (artes) artes.classList.toggle('d-none', t !== 'artes');
    $('dsRepos').classList.toggle('d-none', t !== 'repos');
    if (t === 'repos') cargarRepos();
  }

  // ---------- Quién soy ----------
  function elegirYo(d) {
    yo = DISENADORES.includes(d) ? d : '';
    guardar('uh_disenador', yo);
    est = null;
    pintarYo();
    if (yo) cargarEstado();
  }
  function pintarYo() {
    document.querySelectorAll('.ds-yo').forEach(b => {
      const activo = b.dataset.yo === yo;
      b.classList.toggle('btn-primary', activo);
      b.classList.toggle('btn-outline-secondary', !activo);
    });
    $('dsMiTrabajo').classList.toggle('d-none', !yo);
    pintarMiTrabajo();
    redecorarTabla();
    pintarRepos();
  }

  // ---------- Mi trabajo (diseñador) ----------
  async function cargarEstado() {
    if (!yo) return;
    try {
      est = await apiGet('/estado?d=' + encodeURIComponent(yo));
      estAt = Date.now();
      marcarConexion(true);
    } catch (e) { marcarConexion(false); }
    pintarMiTrabajo();
    redecorarTabla();
  }

  function pintarMiTrabajo() {
    const box = $('dsMiTrabajo');
    if (!box || !yo) return;
    if (!est) { box.innerHTML = '<div class="text-muted small mt-3">Cargando tu trabajo…</div>'; return; }
    const run = corriendo();
    const pausadas = (est.abiertas || []).filter(a => a.evento === 'PAUSA');
    const hoy = est.hoy || {};
    const ahora = run ? `
      <div class="ds-ahora ds-ahora-on">
        <div class="ds-ahora-txt"><div class="small text-uppercase fw-bold opacity-75">Trabajando en</div>
          <div class="ds-ref">${esc(run.referencia)}</div><div class="small">${esc(run.detalle || '')}</div></div>
        <div class="ds-reloj" data-ds-reloj="${esc(run.referencia)}">${dur(segActual(run))}</div>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-warning" data-ds="pausa" data-ref="${esc(run.referencia)}"><i class="fa-solid fa-pause"></i> Pausa</button>
          <button type="button" class="btn btn-success" data-ds="final" data-ref="${esc(run.referencia)}"><i class="fa-solid fa-flag-checkered"></i> Final</button>
        </div></div>` : `
      <div class="ds-ahora"><div class="ds-ahora-txt"><div class="fw-bold">Sin tarea en curso</div>
        <div class="small text-muted">Dale ▶ a un UHI de la lista, toma una reposición o registra otra actividad.</div></div></div>`;
    const lista = pausadas.length ? pausadas.map(a => `
      <div class="ds-pausada"><div><b>${esc(a.referencia)}</b> <span class="small text-muted">${esc(a.detalle || '')}</span>
        <div class="small text-muted">En pausa: ${esc(a.motivo || '')} - llevas ${durCorta(a.seg)}</div></div>
        <div class="d-flex gap-1">
          <button type="button" class="btn btn-sm btn-outline-primary" data-ds="inicio" data-ref="${esc(a.referencia)}" title="Reanudar"><i class="fa-solid fa-play"></i></button>
          <button type="button" class="btn btn-sm btn-outline-success" data-ds="final" data-ref="${esc(a.referencia)}" title="Final"><i class="fa-solid fa-flag-checkered"></i></button>
        </div></div>`).join('') : '<div class="small text-muted">Nada en pausa.</div>';
    box.innerHTML = `
      <div class="row g-3 mt-1">
        <div class="col-lg-6">${ahora}
          <button type="button" class="btn btn-sm btn-outline-secondary mt-2" data-ds="otra"><i class="fa-solid fa-briefcase"></i> Otra actividad</button></div>
        <div class="col-lg-4"><div class="small fw-bold text-uppercase text-muted mb-1">En pausa</div>${lista}</div>
        <div class="col-lg-2"><div class="small fw-bold text-uppercase text-muted mb-1">Hoy</div>
          <div class="ds-hoy"><span>Trabajado</span><b>${durCorta(hoy.TRABAJO)}</b></div>
          <div class="ds-hoy"><span>En pausa</span><b>${durCorta(hoy.PAUSA)}</b></div>
          <div class="ds-hoy"><span>Terminados</span><b>${est.finalizados_hoy || 0}</b></div></div>
      </div>`;
  }

  function tic() {
    const run = corriendo();
    document.querySelectorAll('[data-ds-reloj]').forEach(el => {
      const a = abierta(el.dataset.dsReloj);
      if (a) el.textContent = dur(segActual(a));
    });
    document.title = run ? `▶ ${run.referencia} - Solicitudes de Arte` : 'UH | Solicitudes de Arte UH';
  }

  // Busca un UHI de la página de William para guardar cliente - producto
  function solicitudPorId(ref) {
    try { return (solicitudes || []).find(s => String(s.id) === String(ref)); } catch (e) { return null; }
  }
  function detalleDe(ref) {
    const a = abierta(ref); if (a && a.detalle) return a.detalle;
    const s = solicitudPorId(ref);
    return s ? [s.cliente, s.producto].filter(Boolean).join(' - ') : '';
  }
  function tipoDe(ref) {
    const a = abierta(ref); if (a) return a.tipo;
    if (/^RP-\d+/.test(ref)) return 'REPOSICION';
    if (/^OTRA:/.test(ref)) return 'OTRA';
    return 'ARTE';
  }

  async function evento(ev, ref, extra = {}) {
    if (!yo) { alert('Primero elige quién eres (Soy Gilberto / Soy Nataly).'); return false; }
    try {
      await apiPost('/evento', { d: yo, tipo: extra.tipo || tipoDe(ref), ref, detalle: extra.detalle ?? detalleDe(ref), evento: ev, motivo: extra.motivo || '', comentario: extra.comentario || '' });
      marcarConexion(true);
      await cargarEstado();
      return true;
    } catch (e) {
      marcarConexion(false);
      alert('❌ No se pudo registrar el tiempo: ' + e.message);
      return false;
    }
  }

  function pedirPausa(ref) {
    pausaPendiente = ref;
    $('dsPausaRef').textContent = `${ref} - ${detalleDe(ref)}`;
    document.querySelectorAll('input[name="dsMotivo"]').forEach(r => r.checked = false);
    $('dsPausaCom').value = '';
    bootstrap.Modal.getOrCreateInstance($('dsModalPausa')).show();
  }
  async function confirmarPausa() {
    const m = document.querySelector('input[name="dsMotivo"]:checked');
    if (!m) { alert('Elige el motivo de la pausa.'); return; }
    const ok = await evento('PAUSA', pausaPendiente, { motivo: m.value, comentario: $('dsPausaCom').value });
    if (ok) bootstrap.Modal.getOrCreateInstance($('dsModalPausa')).hide();
  }
  async function confirmarOtra() {
    const sel = $('dsOtraSel').value;
    const txt = sel === 'Otra' ? $('dsOtraTxt').value.trim() : sel;
    if (!txt) { alert('Escribe la actividad.'); return; }
    const ok = await evento('INICIO', 'OTRA: ' + txt, { tipo: 'OTRA', detalle: '' });
    if (ok) bootstrap.Modal.getOrCreateInstance($('dsModalOtra')).hide();
  }
  async function finalizar(ref) {
    const s = solicitudPorId(ref);
    const extra = s ? '\n\nRecuerda marcarlo también como terminado en la solicitud (botón "Marcar como terminado").' : '';
    if (!confirm(`¿Terminaste ${ref}?${extra}`)) return;
    await evento('FINAL', ref);
  }

  // ---------- Botones en la tabla de solicitudes y en el detalle ----------
  function botonUHI(s) {
    if (!yo || !s || !s.id) return '';
    const e = String(s.estado || '');
    if (e.includes('FINAL') || e === 'PLANCHAS PENDIENTE') return '';
    const a = abierta(String(s.id));
    if (a && a.evento === 'INICIO')
      return `<button type="button" class="btn btn-warning btn-sm ms-1" data-ds="pausa" data-ref="${esc(s.id)}" title="Pausar"><i class="fa-solid fa-pause"></i> <span data-ds-reloj="${esc(s.id)}">${dur(segActual(a))}</span></button>`;
    return `<button type="button" class="btn btn-outline-primary btn-sm ms-1" data-ds="inicio" data-ref="${esc(s.id)}" title="${a ? 'Reanudar' : 'Iniciar'} tiempo"><i class="fa-solid fa-play"></i>${a ? ' ' + durCorta(a.seg) : ''}</button>`;
  }
  let ultimaData = [];
  function redecorarTabla() {
    const tbody = $('tablaSolicitudes'); if (!tbody) return;
    [...tbody.querySelectorAll('tr')].forEach((tr, i) => {
      const s = ultimaData[i];
      const td = tr.lastElementChild; if (!td || !s) return;
      td.querySelectorAll('.ds-cel').forEach(x => x.remove());
      const td0 = tr.firstElementChild;
      if (td0) { td0.querySelectorAll('.ds-prop').forEach(x => x.remove()); td0.insertAdjacentHTML('beforeend', badgeProp(tipos[String(s.id)])); }
      td.insertAdjacentHTML('beforeend', `<span class="ds-cel">${botonUHI(s)}</span>`);
      const a = abierta(String(s.id));
      tr.classList.toggle('ds-fila-on', !!(yo && a && a.evento === 'INICIO'));
    });
  }
  function bloquePropDetalle(s) {
    const cont = $('detalleContenido'); if (!cont || !s || !s.id) return;
    const p = tipos[String(s.id)] || '';
    cont.insertAdjacentHTML('afterbegin', `<div class="ds-prop-detalle mb-3"><span class="small text-muted me-2">¿Para qué es el arte?</span>
      <span id="dsPropDetalle">${badgeProp(p) || '<span class="small text-danger">Sin indicar</span>'}</span>
      <select class="form-select form-select-sm d-inline-block w-auto ms-2" data-ds-prop="${esc(s.id)}">
        <option value="">${p ? 'Cambiar…' : 'Indicar…'}</option>${PROPOSITOS.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>`);
    cont.querySelector('[data-ds-prop]').addEventListener('change', e => { if (e.target.value) cambiarTipo(e.target.dataset.dsProp, e.target.value); });
  }
  function bloqueDetalle(s) {
    if (!yo || !s) return;
    const e = String(s.estado || '');
    if (e.includes('FINAL') || e === 'PLANCHAS PENDIENTE') return;
    const a = abierta(String(s.id));
    const cont = $('detalleContenido'); if (!cont) return;
    const run = a && a.evento === 'INICIO';
    cont.insertAdjacentHTML('beforeend', `
      <div class="ds-detalle mt-4"><div><i class="fa-solid fa-stopwatch me-2"></i><b>Tiempo de diseño (${esc(yo)})</b>
        <div class="small text-muted">${a ? (run ? 'Corriendo' : 'En pausa: ' + esc(a.motivo || '')) : 'Sin iniciar'} - acumulado <span data-ds-reloj="${esc(s.id)}">${dur(segActual(a))}</span></div></div>
        <div class="d-flex gap-2">
          ${run ? `<button type="button" class="btn btn-warning" data-ds="pausa" data-ref="${esc(s.id)}"><i class="fa-solid fa-pause"></i> Pausa</button>`
                : `<button type="button" class="btn btn-primary" data-ds="inicio" data-ref="${esc(s.id)}"><i class="fa-solid fa-play"></i> ${a ? 'Reanudar' : 'Inicio'}</button>`}
          ${a ? `<button type="button" class="btn btn-success" data-ds="final" data-ref="${esc(s.id)}"><i class="fa-solid fa-flag-checkered"></i> Final</button>` : ''}
        </div></div>`);
  }

  // Envolver funciones de app.js sin cambiarlas
  function envolver() {
    if (typeof renderTabla === 'function') {
      const orig = renderTabla;
      renderTabla = function (data) { orig(data); ultimaData = data || []; buscarSinCodigo(); redecorarTabla(); };
    }
    if (typeof verSolicitud === 'function') {
      const orig = verSolicitud;
      verSolicitud = function (index) { orig(index); try { bloquePropDetalle(solicitudDetalleActual); bloqueDetalle(solicitudDetalleActual); } catch (e) { } };
    }
    // "Marcar en proceso" de diseño arranca el tiempo; "Marcar como terminado" lo cierra
    if (typeof marcarComoProceso === 'function') {
      const orig = marcarComoProceso;
      marcarComoProceso = async function () {
        let s = null; try { s = solicitudDetalleActual; } catch (e) { }
        if (yo && s && s.estado !== 'PLANCHAS PENDIENTE' && !(abierta(String(s.id)) || {}).evento?.includes('INICIO'))
          evento('INICIO', String(s.id), { tipo: 'ARTE', detalle: [s.cliente, s.producto].filter(Boolean).join(' - ') });
        return orig.apply(this, arguments);
      };
    }
    if (typeof marcarComoTerminado === 'function') {
      const orig = marcarComoTerminado;
      marcarComoTerminado = async function () {
        let s = null; try { s = solicitudDetalleActual; } catch (e) { }
        if (yo && s) evento('FINAL', String(s.id), { tipo: 'ARTE', detalle: [s.cliente, s.producto].filter(Boolean).join(' - ') });
        return orig.apply(this, arguments);
      };
    }
  }

  // ---------- Reposiciones ----------
  async function cargarRepos() {
    try {
      const j = await apiGet('/reposiciones');
      repos = j.filas || [];
      marcarConexion(true);
      avisarNuevas();
    } catch (e) { marcarConexion(false); }
    pintarRepos();
  }
  function avisarNuevas() {
    const nuevas = repos.filter(r => r.estado === 'NUEVA').map(r => r.id);
    if (reposVistas && yo) {
      const llegaron = nuevas.filter(id => !reposVistas.has(id));
      if (llegaron.length) { pitido(); toast(`🔔 ${llegaron.length === 1 ? 'Llegó una reposición' : 'Llegaron ' + llegaron.length + ' reposiciones'} de producción`); }
    }
    reposVistas = new Set(nuevas);
  }
  function pitido() {
    try {
      const c = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach(t => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.15, c.currentTime + t); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.15); });
    } catch (e) { }
  }
  function toast(txt) {
    const d = document.createElement('div');
    d.className = 'ds-toast'; d.textContent = txt;
    d.addEventListener('click', () => { verTab('repos'); d.remove(); });
    document.body.appendChild(d); setTimeout(() => d.remove(), 12000);
  }

  function badgeUrg(u) {
    const c = u === 'MÁQUINA PARADA' ? 'danger' : u === 'URGENTE' ? 'warning' : 'secondary';
    return `<span class="badge text-bg-${c}">${esc(u)}</span>`;
  }
  function pintarRepos() {
    const body = $('dsReposBody'); if (!body) return;
    const pend = repos.filter(r => ['NUEVA', 'EN DISEÑO'].includes(r.estado)).length;
    const badge = $('dsReposBadge');
    badge.textContent = pend; badge.classList.toggle('d-none', !pend);
    const lista = repos.filter(r => verCerradas || !['PLANCHA LISTA', 'ANULADA'].includes(r.estado));
    $('dsReposVacio').classList.toggle('d-none', lista.length > 0);
    body.innerHTML = lista.map(r => {
      let acc = '—';
      if (r.estado === 'NUEVA')
        acc = yo ? `<button type="button" class="btn btn-sm btn-primary" data-ds="tomar" data-id="${r.id}"><i class="fa-solid fa-play"></i> Revisar</button>
                    <button type="button" class="btn btn-sm btn-outline-success" data-ds="enviar" data-id="${r.id}" title="Revisada, sin cambios"><i class="fa-solid fa-paper-plane"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-ds="anular" data-id="${r.id}" title="Anular"><i class="fa-solid fa-ban"></i></button>`
                 : '<span class="small text-muted">Esperando a diseño</span>';
      else if (r.estado === 'EN DISEÑO')
        acc = yo ? `<button type="button" class="btn btn-sm btn-success" data-ds="enviar" data-id="${r.id}"><i class="fa-solid fa-paper-plane"></i> Enviar a planchas</button>
                    ${yo === r.disenador ? '' : `<button type="button" class="btn btn-sm btn-outline-primary" data-ds="tomar" data-id="${r.id}" title="Tomarla yo"><i class="fa-solid fa-play"></i></button>`}
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-ds="anular" data-id="${r.id}" title="Anular"><i class="fa-solid fa-ban"></i></button>`
                 : '<span class="small text-muted">En revisión</span>';
      else if (r.estado === 'ENVIADA A PLANCHAS')
        acc = `<button type="button" class="btn btn-sm btn-success" data-ds="lista" data-id="${r.id}"><i class="fa-solid fa-circle-check"></i> Plancha lista</button>`;
      const estCls = { 'NUEVA': 'warning', 'EN DISEÑO': 'info', 'ENVIADA A PLANCHAS': 'danger', 'PLANCHA LISTA': 'success', 'ANULADA': 'secondary' }[r.estado] || 'secondary';
      const quien = r.disenador ? `<div class="small text-muted">${esc(r.disenador)}${r.cambio_arte != null ? (r.cambio_arte ? ' - con cambio de arte' : ' - sin cambio') : ''}</div>` : '';
      const notas = [r.colores && 'Colores: ' + r.colores, r.comentario, r.nota_diseno && 'Diseño: ' + r.nota_diseno].filter(Boolean).map(esc).join('<br>');
      return `<tr class="${r.urgencia === 'MÁQUINA PARADA' && !['PLANCHA LISTA', 'ANULADA'].includes(r.estado) ? 'ds-fila-parada' : ''}">
        <td><strong>${esc(r.codigo)}</strong></td><td>${badgeUrg(r.urgencia)}</td><td>${esc(r.op || '—')}</td><td>${esc(r.uhi || '—')}</td><td>${esc(r.maquina || '—')}</td>
        <td>${esc(r.motivo)}${notas ? `<div class="small text-muted">${notas}</div>` : ''}</td>
        <td>${esc(r.solicitante)}<div class="small text-muted">${hace(r.creada)}</div></td>
        <td><span class="badge text-bg-${estCls}">${esc(r.estado)}</span>${quien}</td>
        <td class="text-nowrap">${acc}</td></tr>`;
    }).join('');
  }

  function abrirNuevaRep() {
    $('dsFormRep').reset();
    $('dsRepSol').value = leer('uh_solicitante_rep');
    bootstrap.Modal.getOrCreateInstance($('dsModalRep')).show();
  }
  async function enviarNuevaRep(ev) {
    ev.preventDefault();
    const b = {
      solicitante: $('dsRepSol').value, op: $('dsRepOp').value, uhi: $('dsRepUhi').value, maquina: $('dsRepMaq').value,
      motivo: $('dsRepMot').value, colores: $('dsRepCol').value, comentario: $('dsRepCom').value,
      urgencia: (document.querySelector('input[name="dsRepUrg"]:checked') || {}).value || 'NORMAL'
    };
    if (!b.op.trim() && !b.uhi.trim()) { alert('Escribe la OP o el UHI.'); return; }
    const btn = $('dsBtnGuardarRep'); btn.disabled = true;
    try {
      const j = await apiPost('/reposiciones/nueva', b);
      if (reposVistas && j.filas && j.filas[0]) reposVistas.add(j.filas[0].id);   // la que pedí yo no suena
      guardar('uh_solicitante_rep', b.solicitante);
      bootstrap.Modal.getOrCreateInstance($('dsModalRep')).hide();
      alert(`✅ Reposición enviada a Diseño. Código: ${(j.filas[0] || {}).codigo || ''}`);
      await cargarRepos();
    } catch (e) { alert('❌ No se pudo enviar: ' + e.message); }
    finally { btn.disabled = false; }
  }
  async function accionRep(accion, id, extra = {}) {
    try {
      const j = await apiPost('/reposiciones/accion', { accion, id, d: yo, ...extra });
      if (!j.filas || !j.filas.length) alert('Esta reposición ya cambió de estado (quizás la atendió otra persona). Se actualiza la lista.');
    } catch (e) { alert('❌ ' + e.message); }
    await Promise.all([cargarRepos(), cargarEstado()]);
  }
  function pedirEnvio(id) {
    const r = repos.find(x => x.id == id); if (!r) return;
    envioPendiente = id;
    $('dsEnvioRef').textContent = `${r.codigo} - ${[r.op && 'OP ' + r.op, r.uhi, r.maquina].filter(Boolean).join(' - ')} - ${r.motivo}`;
    $('dsCambioNo').checked = true; $('dsEnvioNota').value = '';
    bootstrap.Modal.getOrCreateInstance($('dsModalEnvio')).show();
  }
  async function confirmarEnvio() {
    const btn = $('dsBtnConfirmarEnvio'); btn.disabled = true;
    await accionRep('enviar', envioPendiente, { cambio_arte: $('dsCambioSi').checked, nota: $('dsEnvioNota').value });
    btn.disabled = false;
    bootstrap.Modal.getOrCreateInstance($('dsModalEnvio')).hide();
  }

  // ---------- Un solo manejador para todos los botones ----------
  function clicGlobal(e) {
    const b = e.target.closest('[data-ds]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const ref = b.dataset.ref, id = b.dataset.id;
    switch (b.dataset.ds) {
      case 'inicio': evento('INICIO', ref); break;
      case 'pausa': pedirPausa(ref); break;
      case 'final': finalizar(ref); break;
      case 'otra': $('dsOtraSel').selectedIndex = 0; $('dsOtraTxt').value = ''; $('dsOtraTxt').classList.add('d-none');
        bootstrap.Modal.getOrCreateInstance($('dsModalOtra')).show(); break;
      case 'tomar': accionRep('tomar', id); break;
      case 'enviar': pedirEnvio(id); break;
      case 'anular': { const n = prompt('¿Por qué se anula? (duplicada, ya no se necesita…)'); if (n !== null) accionRep('anular', id, { nota: n }); break; }
      case 'lista': if (confirm('¿Confirmas que la plancha ya está lista?')) accionRep('lista', id); break;
    }
  }

  // ---------- Arranque ----------
  function iniciar() {
    envolver();
    vigilarCreacion();
    montar();
    cargarRepos();
    cargarTipos();
    if (yo) cargarEstado();
    setInterval(tic, 1000);
    setInterval(() => { if (!document.hidden) { cargarRepos(); cargarTipos(); if (yo) cargarEstado(); } }, CADA_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { cargarRepos(); if (yo) cargarEstado(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
