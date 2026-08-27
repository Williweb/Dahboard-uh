/*
 * RUA - Solicitudes de Arte V2
 * Backend esperado: Google Apps Script Web App.
 *
 * IMPORTANTE:
 * URL_API_SHEETS es la misma URL que tenía el proyecto original.
 * El GET debe devolver JSON con una matriz de solicitudes.
 * El POST debe aceptar JSON y guardar la solicitud.
 */
const URL_API_SHEETS = "https://script.google.com/macros/s/AKfycbxHyae7m1mdlTMQjYuLKLHNpyEViLaZqxcDXLZ02AmzWXZyKokMuFwtyrJ12VM2c85L/exec";

let solicitudes = [];
let solicitudesFiltradas = [];

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("formSolicitud").addEventListener("submit", guardarEnGoogleSheets);
  document.getElementById("btnActualizar").addEventListener("click", cargarSolicitudes);
  document.getElementById("btnExportar").addEventListener("click", exportarExcel);
  document.getElementById("btnLimpiarFiltros").addEventListener("click", limpiarFiltros);

  ["filtroTexto","filtroEstado","filtroMaquina","filtroPresentacion"].forEach(id => {
    document.getElementById(id).addEventListener("input", aplicarFiltros);
    document.getElementById(id).addEventListener("change", aplicarFiltros);
  });

  cargarSolicitudes();
});

async function cargarSolicitudes() {
  mostrarEstadoTabla("Cargando solicitudes...", true);
  try {
    const res = await fetch(URL_API_SHEETS + "?t=" + Date.now(), { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    // Acepta {data:[...]} o directamente [...]
    solicitudes = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
    solicitudes = solicitudes.map(normalizarSolicitud);

    actualizarKPI(solicitudes);
    poblarFiltroMaquinas(solicitudes);
    aplicarFiltros();
    mostrarAlerta("Conectado a Google Sheets. " + solicitudes.length + " solicitudes cargadas.", "success");
  } catch (error) {
    console.error(error);
    solicitudes = [];
    actualizarKPI([]);
    renderTabla([]);
    mostrarEstadoTabla("No se pudieron cargar las solicitudes.", false, "Verifica que tu Web App de Google Apps Script tenga una función doGet() y esté desplegada con acceso para quien tenga el enlace.");
    mostrarAlerta("No fue posible leer Google Sheets. El formulario puede seguir enviando datos si el POST de tu Apps Script está funcionando.", "warning");
  }
}

function normalizarSolicitud(raw) {
  const s = raw || {};
  return {
    id: valor(s, ["id","ID","no","No.","numero","Número","numeroSolicitud","No"]),
    cliente: valor(s, ["cliente","Cliente"]),
    producto: valor(s, ["producto","Producto"]),
    fecha: valor(s, ["fecha","Fecha","timestamp","Timestamp"]),
    arte: valor(s, ["arte","Arte","archivo","Archivo","referencia","Referencia"]),
    solicitadoPor: valor(s, ["solicitadoPor","Solicitado Por","solicitante","Solicitante"]),
    maquina: valor(s, ["maquina","Máquina","Maquina"]),
    estado: (valor(s, ["estado","Estado","status","Status"]) || "PENDIENTE").toString().toUpperCase(),
    prioridad: (valor(s, ["prioridad","Prioridad"]) || "NORMAL").toString().toUpperCase(),
    material: valor(s, ["material","Material"]),
    acabado: valor(s, ["acabado","Acabado"]),
    ancho: valor(s, ["ancho","Ancho"]),
    largo: valor(s, ["largo","Largo"]),
    presentacion: valor(s, ["presentacion","Presentacion","Rollos / Hojas"]),
    salidaRollo: valor(s, ["salidaRollo","Salida de Rollo"]),
    cornerRadio: valor(s, ["cornerRadio","Corner Radio"]),
    troquel: valor(s, ["troquel","Troquel"]),
    fechaRequerida: valor(s, ["fechaRequerida","Fecha requerida","Fecha Requerida"]),
    observaciones: valor(s, ["observaciones","Observaciones"]),
    color1: valor(s, ["color1","Color 1"]),
    color2: valor(s, ["color2","Color 2"]),
    color3: valor(s, ["color3","Color 3"]),
    color4: valor(s, ["color4","Color 4"]),
    color5: valor(s, ["color5","Color 5"]),
    color6: valor(s, ["color6","Color 6"]),
    color7: valor(s, ["color7","Color 7"]),
    color8: valor(s, ["color8","Color 8"]),
    raw: s
  };
}

function valor(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") return obj[key];
  }
  return "";
}

function actualizarKPI(data) {
  const norm = data.map(s => s.estado.toUpperCase());
  document.getElementById("kpiPendientes").textContent = norm.filter(x => x === "PENDIENTE" || x === "PENDIENTES").length;
  document.getElementById("kpiProceso").textContent = norm.filter(x => x.includes("PROCESO") || x === "EN DISEÑO" || x === "ASIGNADA").length;
  document.getElementById("kpiFinalizados").textContent = norm.filter(x => x.includes("FINAL")).length;
  document.getElementById("kpiUrgentes").textContent = data.filter(s => s.prioridad === "URGENTE" || s.estado === "URGENTE").length;
}

function poblarFiltroMaquinas(data) {
  const select = document.getElementById("filtroMaquina");
  const actual = select.value;
  const maquinas = [...new Set(data.map(s => s.maquina).filter(Boolean))].sort();
  select.innerHTML = '<option value="">Todas las máquinas</option>' +
    maquinas.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (maquinas.includes(actual)) select.value = actual;
}

function aplicarFiltros() {
  const texto = document.getElementById("filtroTexto").value.trim().toLowerCase();
  const estado = document.getElementById("filtroEstado").value;
  const maquina = document.getElementById("filtroMaquina").value;
  const presentacion = document.getElementById("filtroPresentacion").value;

  solicitudesFiltradas = solicitudes.filter(s => {
    const bolsa = [s.id,s.cliente,s.producto,s.solicitadoPor,s.maquina,s.material,s.estado,s.prioridad].join(" ").toLowerCase();
    return (!texto || bolsa.includes(texto))
      && (!estado || estadoCoincide(s.estado, estado))
      && (!maquina || s.maquina === maquina)
      && (!presentacion || s.presentacion.toUpperCase() === presentacion);
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
function actualizarColores(){

    const maquina =
        document.getElementById("maquina").value;

    let max = 0;

    switch(maquina){

        case "MARKANDY":
            max = 1;
            break;

        case "DIGITAL":
            max = 4;
            break;

        case "ZTJ330":
            max = 5;
            break;

        case "FIT":
            max = 6;
            break;

        case "SPS4":
            max = 8;
            break;

        default:
            max = 0;
    }

    for(let i = 1; i <= 8; i++){

        const campo =
            document.getElementById(
                "color" + i
            );

        if(!campo) continue;

        campo.disabled = i > max;

        if(i > max){
            campo.value = "";
        }
    }
}

document.addEventListener(
    "DOMContentLoaded",
    actualizarColores
);

function renderTabla(data) {
  const tbody = document.getElementById("tablaSolicitudes");
  tbody.innerHTML = "";

  if (!data.length) {
    mostrarEstadoTabla("No hay solicitudes que coincidan con los filtros.", false);
  } else {
    document.getElementById("estadoTabla").classList.add("d-none");
  }

  data.forEach((s, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.id || ("#" + (index + 1)))}</strong></td>
      <td>${escapeHtml(s.cliente)}</td>
      <td>${escapeHtml(s.producto)}</td>
      <td>${escapeHtml(formatearFecha(s.fecha))}</td>
      <td>${s.arte ? '<i class="fa-solid fa-circle-check icon-ok" title="Referencia disponible"></i>' : '<i class="fa-solid fa-circle-xmark icon-no" title="Sin referencia"></i>'}</td>
      <td>${escapeHtml(s.solicitadoPor)}</td>
      <td>${escapeHtml(s.maquina)}</td>
      <td>${badgeEstado(s)}</td>
      <td>
        <button class="btn btn-primary btn-sm" title="Ver detalle" onclick="verDetallePorId(${indexKey(s)})">
          <i class="fa-solid fa-eye"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  document.getElementById("contadorSolicitudes").textContent =
    `${data.length} ${data.length === 1 ? "solicitud" : "solicitudes"}`;
}

function indexKey(s) {
  // Usamos un índice estable en el arreglo original para evitar problemas con comillas.
  return solicitudes.indexOf(s);
}

function badgeEstado(s) {
  const e = (s.estado || "PENDIENTE").toUpperCase();
  let cls = "badge-pendiente";
  if (e.includes("FINAL")) cls = "badge-finalizado";
  else if (e.includes("PROCESO") || e === "EN DISEÑO" || e === "ASIGNADA") cls = "badge-proceso";
  else if (e === "URGENTE" || s.prioridad === "URGENTE") cls = "badge-urgente";
  return `<span class="status-badge ${cls}">${escapeHtml(s.estado || "PENDIENTE")}</span>`;
}

function verDetallePorId(index) {
  const s = solicitudes[index];
  if (!s) return;
  document.getElementById("detalleTitulo").textContent = `${s.id || "Solicitud"} — ${s.cliente || ""}`;
  document.getElementById("detalleSubtitulo").textContent = `${s.producto || ""} · ${formatearFecha(s.fecha)}`;

  const colores = [1,2,3,4,5,6,7,8].map(n => s["color"+n]).filter(Boolean).map(c => `<span class="color-pill">${escapeHtml(c)}</span>`).join(" ");

  document.getElementById("detalleContenido").innerHTML = `
    <div class="row g-3">
      <div class="col-md-8">
        <div class="detail-card">
          <h6>Información general</h6>
          <div class="detail-grid">
            ${campoDetalle("Cliente",s.cliente)}
            ${campoDetalle("Producto",s.producto)}
            ${campoDetalle("Solicitado por",s.solicitadoPor)}
            ${campoDetalle("Máquina",s.maquina)}
            ${campoDetalle("Estado",s.estado)}
            ${campoDetalle("Prioridad",s.prioridad)}
            ${campoDetalle("Fecha solicitud",formatearFecha(s.fecha))}
            ${campoDetalle("Fecha requerida",s.fechaRequerida)}
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="detail-card">
          <h6>Producción</h6>
          <div class="detail-grid one">${campoDetalle("Material",s.material)}${campoDetalle("Acabado",s.acabado)}${campoDetalle("Ancho",s.ancho)}${campoDetalle("Largo",s.largo)}${campoDetalle("Presentación",s.presentacion)}${campoDetalle("Salida de rollo",s.salidaRollo)}${campoDetalle("Corner Radio",s.cornerRadio)}${campoDetalle("Troquel",s.troquel)}</div>
        </div>
      </div>
      <div class="col-12">
        <div class="detail-card"><h6>Colores</h6><div>${colores || '<span class="text-muted">No especificados</span>'}</div></div>
      </div>
      <div class="col-12">
        <div class="detail-card"><h6>Referencia / archivo</h6>
          ${s.arte ? `<a class="btn btn-outline-primary btn-sm" href="${escapeAttr(s.arte)}" target="_blank" rel="noopener"><i class="fa-solid fa-paperclip"></i> Abrir archivo</a>` : '<span class="text-muted">No hay archivo registrado.</span>'}
        </div>
      </div>
      <div class="col-12">
        <div class="detail-card"><h6>Observaciones</h6><div class="observaciones">${escapeHtml(s.observaciones || "Sin observaciones.")}</div></div>
      </div>
    </div>`;

  bootstrap.Modal.getOrCreateInstance(document.getElementById("modalDetalle")).show();
}

function campoDetalle(label, value) {
  return `<div><span class="detail-label">${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`;
}

function formatearFecha(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("es-SV", {day:"2-digit",month:"2-digit",year:"numeric"});
}

function limpiarFiltros() {
  document.getElementById("filtroTexto").value = "";
  document.getElementById("filtroEstado").value = "";
  document.getElementById("filtroMaquina").value = "";
  document.getElementById("filtroPresentacion").value = "";
  aplicarFiltros();
}

async function guardarEnGoogleSheets(e) {
  e.preventDefault();
  const btn = document.getElementById("btnGuardar");
  const original = btn.innerHTML;

  const payload = {
    accion: "crearSolicitud",
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
    color1: val("color1"), color2: val("color2"), color3: val("color3"), color4: val("color4"),
    color5: val("color5"), color6: val("color6"), color7: val("color7"), color8: val("color8"),
    observaciones: val("observaciones"),
    archivoNombre: document.getElementById("adjunto").files[0]?.name || ""
  };

  if (!payload.cliente || !payload.producto) {
    alert("Completa Cliente y Producto.");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

  try {
    // Se conserva text/plain para evitar preflight CORS con Apps Script.
    const res = await fetch(URL_API_SHEETS, {
      method: "POST",
      mode: "cors",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = {status: res.ok ? "success" : "error", message:text}; }

    if (!res.ok || (data.status && data.status !== "success")) {
      throw new Error(data.message || "No se pudo guardar.");
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById("modalSolicitud")).hide();
    document.getElementById("formSolicitud").reset();
    mostrarAlerta("Solicitud guardada correctamente. Actualizando Dashboard...", "success");
    await cargarSolicitudes();
  } catch (err) {
    console.error(err);
    alert("No se pudo guardar la solicitud: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function val(id) { return document.getElementById(id).value.trim(); }

function exportarExcel() {
  if (!solicitudesFiltradas.length) {
    alert("No hay solicitudes para exportar.");
    return;
  }
  const headers = ["No.","Cliente","Producto","Fecha","Solicitado Por","Máquina","Estado","Prioridad","Material","Acabado","Ancho","Largo","Presentación","Salida Rollo","Corner Radio","Troquel","Fecha Requerida","Observaciones"];
  const rows = solicitudesFiltradas.map(s => [
    s.id,s.cliente,s.producto,s.fecha,s.solicitadoPor,s.maquina,s.estado,s.prioridad,s.material,s.acabado,s.ancho,s.largo,s.presentacion,s.salidaRollo,s.cornerRadio,s.troquel,s.fechaRequerida,s.observaciones
  ]);
  const csv = [headers,...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "solicitudes_arte_RUA.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvCell(v) { return `"${String(v ?? "").replace(/"/g,'""')}"`; }

function mostrarEstadoTabla(texto, visible=true, sub="") {
  const el = document.getElementById("estadoTabla");
  el.classList.toggle("d-none", !visible);
  if (visible) el.innerHTML = `<i class="fa-solid fa-circle-info"></i><p class="mb-1">${escapeHtml(texto)}</p><small>${escapeHtml(sub)}</small>`;
}

function mostrarAlerta(texto, tipo) {
  const el = document.getElementById("alertaConexion");
  el.className = "alert alert-" + tipo;
  el.textContent = texto;
  setTimeout(() => el.classList.add("d-none"), 5000);
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function escapeAttr(v) { return escapeHtml(v); }
