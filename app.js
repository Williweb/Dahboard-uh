/*
 * RUA - Solicitudes de Arte V2
 * Frontend conectado a Google Apps Script + Google Sheets
 */
const URL_API_SHEETS = "https://script.google.com/macros/s/AKfycbxyhPusfHe_DZArGoV3-oaqquD6so2EzZ0FxJ78z3aITr7pAcZvlXy7-u7S9JbjKGtC/exec";

let solicitudes = [];
let solicitudesFiltradas = [];

const $ = id => document.getElementById(id);

// =========================================================
// INICIO
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  const form = $("formSolicitud");
  if (form) form.addEventListener("submit", guardarEnGoogleSheets);

  const btnAct = $("btnActualizar");
  if (btnAct) btnAct.addEventListener("click", cargarSolicitudes);

  const btnExp = $("btnExportar");
  if (btnExp) btnExp.addEventListener("click", exportarExcel);

  const btnLimp = $("btnLimpiarFiltros");
  if (btnLimp) btnLimp.addEventListener("click", limpiarFiltros);

  ["filtroTexto", "filtroEstado", "filtroMaquina", "filtroPresentacion"].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener("input", aplicarFiltros);
      el.addEventListener("change", aplicarFiltros);
    }
  });

  actualizarColores();
  cargarSolicitudes();
});

// =========================================================
// GET - CARGAR SOLICITUDES
// =========================================================
async function cargarSolicitudes() {
  mostrarEstadoTabla("Cargando solicitudes...", true);

  try {
    // IMPORTANTE: NO usar mode: "no-cors" aquí porque necesitamos leer JSON.
    const response = await fetch(URL_API_SHEETS + "?t=" + Date.now(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error("Google Apps Script respondió HTTP " + response.status);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(data?.message || "La respuesta no tiene formato de lista.");
    }

    solicitudes = data.map(normalizarSolicitud);
    solicitudesFiltradas = [...solicitudes];

    actualizarKPI(solicitudes);
    poblarFiltroMaquinas(solicitudes);
    renderTabla(solicitudesFiltradas);

    const alerta = $("alertaConexion");
    if (alerta) {
      alerta.className = "alert alert-success py-2";
      alerta.textContent = "✓ Conectado a Google Sheets · " + solicitudes.length + " solicitudes";
    }
  } catch (err) {
    console.error("Error cargando Google Sheets:", err);
    solicitudes = [];
    solicitudesFiltradas = [];
    actualizarKPI([]);
    renderTabla([]);

    const alerta = $("alertaConexion");
    if (alerta) {
      alerta.className = "alert alert-danger py-2";
      alerta.textContent = "✕ No se pudo conectar con Google Sheets: " + err.message;
    }
  }
}

// =========================================================
// POST - GUARDAR SOLICITUD
// =========================================================
async function guardarEnGoogleSheets(e) {
  e.preventDefault();

  const btn = $("btnGuardar");
  const original = btn ? btn.innerHTML : "Guardar Solicitud";

  const val = id => $(id)?.value?.trim() || "";

  const payload = {
    cliente: val("cliente"),
    producto: val("producto"),
    solicitadoPor: val("solicitadoPor"),
    prioridad: val("prioridad"),
    fechaRequerida: val("fechaRequerida"),
    maquina: val("maquina"),
    material: val("material"),
    acabado: val("acabado"),
    ancho: val("ancho"),
    largo: val("largo"),
    presentacion: val("presentacion"),
    salidaRollo: val("salidaRollo"),
    cornerRadio: val("cornerRadio"),
    troquel: val("troquel"),
    color1: val("color1"),
    color2: val("color2"),
    color3: val("color3"),
    color4: val("color4"),
    color5: val("color5"),
    color6: val("color6"),
    color7: val("color7"),
    color8: val("color8"),
    observaciones: val("observaciones"),
    archivoNombre: $("adjunto")?.files?.[0]?.name || ""
  };

  if (!payload.cliente || !payload.producto) {
    alert("⚠️ Debe completar obligatoriamente Cliente y Producto.");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
  }

  try {
    // FormData evita el preflight CORS que suele provocar problemas con
    // application/json en Google Apps Script.
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => formData.append(key, value));

    const response = await fetch(URL_API_SHEETS, {
      method: "POST",
      body: formData,
      redirect: "follow"
    });

    // Si el servidor permite leer la respuesta, validamos el JSON.
    // Si el navegador bloquea la lectura por CORS pero el POST fue enviado,
    // no se considera automáticamente un error de guardado.
    let confirmado = false;

    try {
      if (response.ok) {
        const texto = await response.text();
        if (texto) {
          const data = JSON.parse(texto);
          confirmado = data.status === "success";
          if (!confirmado && data.message) throw new Error(data.message);
        } else {
          confirmado = true;
        }
      }
    } catch (lecturaError) {
      console.warn("Respuesta de Apps Script no pudo leerse por CORS:", lecturaError);
      confirmado = true;
    }

    if (!response.ok) {
      throw new Error("Google Apps Script respondió HTTP " + response.status);
    }

    const modalEl = $("modalSolicitud");
    if (modalEl && window.bootstrap) {
      bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    }

    const form = $("formSolicitud");
    if (form) form.reset();
    actualizarColores();

    alert(confirmado
      ? "🎉 ¡Solicitud enviada correctamente a Google Sheets!"
      : "🎉 Solicitud enviada. Actualizando el dashboard...");

    // Dar tiempo al Apps Script para terminar appendRow.
    setTimeout(cargarSolicitudes, 800);

  } catch (err) {
    console.error("Error en el envío:", err);
    alert("❌ No se pudo enviar la solicitud.\n\n" + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
}

// =========================================================
// NORMALIZACIÓN
// =========================================================
function normalizarSolicitud(raw) {
  const s = raw || {};
  return {
    id: valor(s, ["id", "ID", "no", "No.", "numero", "Número", "numeroSolicitud"]),
    cliente: valor(s, ["cliente", "Cliente"]),
    producto: valor(s, ["producto", "Producto"]),
    fecha: valor(s, ["fecha", "Fecha", "timestamp", "Timestamp", "fechaHora"]),
    arte: valor(s, ["arte", "Arte", "archivo", "Archivo", "referencia", "Referencia", "archivoNombre"]),
    solicitadoPor: valor(s, ["solicitadoPor", "Solicitado Por", "solicitante", "Solicitante"]),
    estado: (valor(s, ["estado", "Estado", "status", "Status"]) || "PENDIENTE").toString().toUpperCase(),
    prioridad: (valor(s, ["prioridad", "Prioridad"]) || "NORMAL").toString().toUpperCase(),
    maquina: valor(s, ["maquina", "Máquina", "Maquina"]),
    material: valor(s, ["material", "Material"]),
    acabado: valor(s, ["acabado", "Acabado"]),
    ancho: valor(s, ["ancho", "Ancho"]),
    largo: valor(s, ["largo", "Largo"]),
    presentacion: valor(s, ["presentacion", "Presentacion", "Rollos / Hojas"]),
    salidaRollo: valor(s, ["salidaRollo", "Salida de Rollo"]),
    cornerRadio: valor(s, ["cornerRadio", "Corner Radio"]),
    troquel: valor(s, ["troquel", "Troquel"]),
    fechaRequerida: valor(s, ["fechaRequerida", "Fecha requerida", "Fecha Requerida"]),
    observaciones: valor(s, ["observaciones", "Observaciones"]),
    color1: valor(s, ["color1", "Color 1"]),
    color2: valor(s, ["color2", "Color 2"]),
    color3: valor(s, ["color3", "Color 3"]),
    color4: valor(s, ["color4", "Color 4"]),
    color5: valor(s, ["color5", "Color 5"]),
    color6: valor(s, ["color6", "Color 6"]),
    color7: valor(s, ["color7", "Color 7"]),
    color8: valor(s, ["color8", "Color 8"]),
    raw: s
  };
}

function valor(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") return obj[key];
  }
  return "";
}

// =========================================================
// KPI / FILTROS
// =========================================================
function actualizarKPI(data) {
  const estados = data.map(s => s.estado.toUpperCase());
  $("kpiPendientes") && ($("kpiPendientes").textContent = estados.filter(x => x === "PENDIENTE" || x === "PENDIENTES").length);
  $("kpiProceso") && ($("kpiProceso").textContent = estados.filter(x => x.includes("PROCESO") || x === "EN DISEÑO" || x === "ASIGNADA").length);
  $("kpiFinalizados") && ($("kpiFinalizados").textContent = estados.filter(x => x.includes("FINAL")).length);
  $("kpiUrgentes") && ($("kpiUrgentes").textContent = data.filter(s => s.prioridad === "URGENTE" || s.estado === "URGENTE").length);
}

function poblarFiltroMaquinas(data) {
  const select = $("filtroMaquina");
  if (!select) return;
  const actual = select.value;
  const maquinas = [...new Set(data.map(s => s.maquina).filter(Boolean))].sort();
  select.innerHTML = '<option value="">Todas las máquinas</option>' +
    maquinas.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (maquinas.includes(actual)) select.value = actual;
}

function aplicarFiltros() {
  const texto = $("filtroTexto")?.value.trim().toLowerCase() || "";
  const estado = $("filtroEstado")?.value || "";
  const maquina = $("filtroMaquina")?.value || "";
  const presentacion = $("filtroPresentacion")?.value || "";

  solicitudesFiltradas = solicitudes.filter(s => {
    const bolsa = [s.id, s.cliente, s.producto, s.solicitadoPor, s.maquina, s.material, s.estado, s.prioridad].join(" ").toLowerCase();
    return (!texto || bolsa.includes(texto))
      && (!estado || estadoCoincide(s.estado, estado))
      && (!maquina || s.maquina === maquina)
      && (!presentacion || (s.presentacion || "").toUpperCase() === presentacion);
  });

  renderTabla(solicitudesFiltradas);
}

function estadoCoincide(actual, filtro) {
  actual = (actual || "").toUpperCase();
  if (filtro === "PENDIENTE") return actual === "PENDIENTE" || actual === "PENDIENTES";
  if (filtro === "EN PROCESO") return actual.includes("PROCESO") || actual === "EN DISEÑO" || actual === "ASIGNADA";
  if (filtro === "FINALIZADO") return actual.includes("FINAL");
  return actual === filtro;
}

function limpiarFiltros() {
  ["filtroTexto", "filtroEstado", "filtroMaquina", "filtroPresentacion"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });
  solicitudesFiltradas = [...solicitudes];
  renderTabla(solicitudesFiltradas);
}

// =========================================================
// COLORES SEGÚN MÁQUINA
// =========================================================
function actualizarColores() {
  const maquina = $("maquina")?.value || "";
  const maximos = { MARKANDY: 1, DIGITAL: 4, ZTJ330: 5, FIT: 6, SPS4: 8 };
  const max = maximos[maquina] || 0;

  for (let i = 1; i <= 8; i++) {
    const campo = $("color" + i);
    if (!campo) continue;
    campo.disabled = i > max;
    if (i > max) campo.value = "";
  }
}

// =========================================================
// TABLA
// =========================================================
function renderTabla(data) {
  const tbody = $("tablaSolicitudes");
  if (!tbody) return;
  tbody.innerHTML = "";

  const contador = $("contadorSolicitudes");
  if (contador) contador.textContent = `${data.length} solicitud${data.length === 1 ? "" : "es"}`;

  if (!data.length) {
    mostrarEstadoTabla("No hay solicitudes que coincidan con los filtros.", false);
    return;
  }

  const estTab = $("estadoTabla");
  if (estTab) estTab.classList.add("d-none");

  data.forEach((s, index) => {
    const tr = document.createElement("tr");
    const id = s.id || ("#" + (index + 1));

    tr.innerHTML = `
      <td><strong>${escapeHtml(id)}</strong></td>
      <td>${escapeHtml(s.cliente)}</td>
      <td>${escapeHtml(s.producto)}</td>
      <td>${escapeHtml(formatearFecha(s.fecha))}</td>
      <td>${s.arte ? '<i class="fa-solid fa-circle-check icon-ok" title="Referencia disponible"></i>' : '<i class="fa-solid fa-circle-xmark icon-no" title="Sin referencia"></i>'}</td>
      <td>${escapeHtml(s.solicitadoPor)}</td>
      <td>${escapeHtml(s.maquina)}</td>
      <td>
        <button class="btn btn-primary btn-sm" type="button" title="Ver detalle">
          <i class="fa-solid fa-eye"></i>
        </button>
      </td>`;

    tr.querySelector("button").addEventListener("click", () => verFormulario(s));
    tbody.appendChild(tr);
  });
}

function mostrarEstadoTabla(mensaje, cargando) {
  const est = $("estadoTabla");
  if (!est) return;
  est.classList.remove("d-none");
  est.innerHTML = cargando
    ? `<p class="mb-1"><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(mensaje)}</p>`
    : `<p class="mb-1">${escapeHtml(mensaje)}</p>`;
}

// =========================================================
// DETALLE
// =========================================================
function verFormulario(solicitud) {
  const modal = $("modalDetalle");
  if (!modal) return;

  const titulo = $("detalleTitulo");
  const subtitulo = $("detalleSubtitulo");
  const contenido = $("detalleContenido");

  if (titulo) titulo.textContent = `${solicitud.cliente || "Solicitud"} · ${solicitud.producto || ""}`;
  if (subtitulo) subtitulo.textContent = `Solicitado por: ${solicitud.solicitadoPor || "—"} · ${formatearFecha(solicitud.fecha)}`;

  if (contenido) {
    const campos = [
      ["Estado", solicitud.estado], ["Prioridad", solicitud.prioridad], ["Máquina", solicitud.maquina],
      ["Material", solicitud.material], ["Acabado", solicitud.acabado], ["Ancho", solicitud.ancho],
      ["Largo", solicitud.largo], ["Presentación", solicitud.presentacion], ["Salida de Rollo", solicitud.salidaRollo],
      ["Corner Radio", solicitud.cornerRadio], ["Troquel", solicitud.troquel], ["Fecha requerida", solicitud.fechaRequerida],
      ["Colores", [1,2,3,4,5,6,7,8].map(i => solicitud[`color${i}`]).filter(Boolean).join(", ")],
      ["Referencia", solicitud.arte || "No adjunta"], ["Observaciones", solicitud.observaciones || "—"]
    ];

    contenido.innerHTML = `<div class="row g-3">${campos.map(([label, value]) => `
      <div class="col-md-6"><div class="border rounded p-3 h-100"><div class="small text-muted">${escapeHtml(label)}</div><div class="fw-semibold">${escapeHtml(value)}</div></div></div>
    `).join("")}</div>`;
  }

  if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal).show();
}

// Compatibilidad con código antiguo que pudiera llamar verFormulario(cliente, producto)
window.verFormulario = function(a, b) {
  if (typeof a === "object") return verFormulario(a);
  const encontrada = solicitudes.find(s => s.cliente === a && s.producto === b);
  if (encontrada) verFormulario(encontrada);
};

// =========================================================
// EXPORTACIÓN CSV (compatible con Excel)
// =========================================================
function exportarExcel() {
  if (!solicitudesFiltradas.length) {
    alert("No hay solicitudes para exportar.");
    return;
  }

  const columnas = ["id","cliente","producto","fecha","solicitadoPor","estado","prioridad","maquina","material","acabado","ancho","largo","presentacion","salidaRollo","cornerRadio","troquel","color1","color2","color3","color4","color5","color6","color7","color8","fechaRequerida","observaciones","archivoNombre"];
  const filas = [columnas, ...solicitudesFiltradas.map(s => columnas.map(c => s[c] ?? ""))];
  const csv = filas.map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "solicitudes_RUA.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// =========================================================
// UTILIDADES
// =========================================================
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatearFecha(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("es-SV", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

window.cargarSolicitudes = cargarSolicitudes;
window.guardarEnGoogleSheets = guardarEnGoogleSheets;
window.actualizarColores = actualizarColores;
window.aplicarFiltros = aplicarFiltros;
