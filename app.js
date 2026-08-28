/*
 * RUA - Solicitudes de Arte V2
 * Backend esperado: Google Apps Script Web App.
 */
const URL_API_SHEETS = "https://script.google.com/macros/s/AKfycbyReGfojukBF1uOAlnejBFIF7rYb2yIJXUxdg5yyGklxEIcqh4RugTRCacq93Oq80VL/exec";

let solicitudes = [];
let solicitudesFiltradas = [];

document.addEventListener("DOMContentLoaded", () => {
  // Verificar existencia de elementos antes de asignar eventos para evitar errores en consola
  const form = document.getElementById("formSolicitud");
  if(form) form.addEventListener("submit", guardarEnGoogleSheets);
  
  const btnAct = document.getElementById("btnActualizar");
  if(btnAct) btnAct.addEventListener("click", cargarSolicitudes);
  
  const btnExp = document.getElementById("btnExportar");
  if(btnExp) btnExp.addEventListener("click", exportarExcel);
  
  const btnLimp = document.getElementById("btnLimpiarFiltros");
  if(btnLimp) btnLimp.addEventListener("click", limpiarFiltros);

  ["filtroTexto","filtroEstado","filtroMaquina","filtroPresentacion"].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
      el.addEventListener("input", aplicarFiltros);
      el.addEventListener("change", aplicarFiltros);
    }
  });

  // Inicializar funciones
  actualizarColores();
  cargarSolicitudes();
});

// --- FUNCIÓN 1: LEER DATOS DE GOOGLE SHEETS (PETICIÓN GET) ---
async function cargarSolicitudes() {
  mostrarEstadoTabla("Cargando solicitudes...", true);
  try {
    const response = await fetch(URL_API_SHEETS, {
      method: "GET",
      mode: "cors"
    });
    
    const data = await response.json();
    
    if (data && Array.isArray(data)) {
      solicitudes = data.map(normalizarSolicitud);
      solicitudesFiltradas = [...solicitudes];
      
      actualizarKPI(solicitudesFiltradas);
      poblarFiltroMaquinas(solicitudes);
      renderTabla(solicitudesFiltradas);
    } else {
      mostrarEstadoTabla("No se encontraron registros o formato inválido.", false);
    }
  } catch (err) {
    console.error("Error al cargar datos:", err);
    mostrarEstadoTabla("❌ Error al conectar con Google Sheets.", false);
  }
}

// --- FUNCIÓN 2: GUARDAR DATOS EN GOOGLE SHEETS (PETICIÓN POST) ---
async function guardarEnGoogleSheets(e) {
  if (e && typeof e.preventDefault === "function") {
    e.preventDefault();
  }

  const btn = document.getElementById("btnGuardar");
  const original = btn ? btn.innerHTML : "Guardar";

  const val = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  };

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
    archivoNombre: document.getElementById("adjunto")?.files[0]?.name || ""
  };

  if (!payload.cliente || !payload.producto) {
    alert("⚠️ Debe completar obligatoriamente Cliente y Producto");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
  }

  try {
    const response = await fetch(URL_API_SHEETS, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.status === "success") {
      const modalEl = document.getElementById("modalSolicitud");
      if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        if (modal) modal.hide();
      }
      
      const form = document.getElementById("formSolicitud");
      if (form) form.reset();
      
      alert("🎉 ¡Solicitud enviada correctamente a Google Sheets!");
      cargarSolicitudes(); // Recarga la tabla de forma automática
    } else {
      alert("❌ Error en el servidor de Google: " + data.message);
    }
  } catch (err) {
    console.error("Error en el envío:", err);
    alert("❌ Error de red al enviar la solicitud.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
}

// --- UTILERÍAS, FILTROS Y PROCESAMIENTO DE DATOS ---
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
  const pend = document.getElementById("kpiPendientes");
  if(pend) pend.textContent = norm.filter(x => x === "PENDIENTE" || x === "PENDIENTES").length;
  
  const proc = document.getElementById("kpiProceso");
  if(proc) proc.textContent = norm.filter(x => x.includes("PROCESO") || x === "EN DISEÑO" || x === "ASIGNADA").length;
  
  const fin = document.getElementById("kpiFinalizados");
  if(fin) fin.textContent = norm.filter(x => x.includes("FINAL")).length;
  
  const urg = document.getElementById("kpiUrgentes");
  if(urg) urg.textContent = data.filter(s => s.prioridad === "URGENTE" || s.estado === "URGENTE").length;
}

function poblarFiltroMaquinas(data) {
  const select = document.getElementById("filtroMaquina");
  if(!select) return;
  const actual = select.value;
  const maquinas = [...new Set(data.map(s => s.maquina).filter(Boolean))].sort();
  select.innerHTML = '<option value="">Todas las máquinas</option>' +
    maquinas.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (maquinas.includes(actual)) select.value = actual;
}

function aplicarFiltros() {
  const txtEl = document.getElementById("filtroTexto");
  const estEl = document.getElementById("filtroEstado");
  const maqEl = document.getElementById("filtroMaquina");
  const presEl = document.getElementById("filtroPresentacion");

  const texto = txtEl ? txtEl.value.trim().toLowerCase() : "";
  const estado = estEl ? estEl.value : "";
  const maquina = maqEl ? maqEl.value : "";
  const presentacion = presEl ? presEl.value : "";

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

function actualizarColores(){
    const maqEl = document.getElementById("maquina");
    if(!maqEl) return;
    const maquina = maqEl.value;
    let max = 0;

    switch(maquina){
        case "MARKANDY": max = 1; break;
        case "DIGITAL": max = 4; break;
        case "ZTJ330": max = 5; break;
        case "FIT": max = 6; break;
        case "SPS4": max = 8; break;
        default: max = 0;
    }

    for(let i = 1; i <= 8; i++){
        const campo = document.getElementById("color" + i);
        if(!campo) continue;
        campo.disabled = i > max;
        if(i > max) campo.value = "";
    }
}

function renderTabla(data) {
  const tbody = document.getElementById("tablaSolicitudes");
  if(!tbody) return;
  tbody.innerHTML = "";

  const estTab = document.getElementById("estadoTabla");
  if (!data.length) {
    mostrarEstadoTabla("No hay solicitudes que coincidan con los filtros.", false);
  } else {
