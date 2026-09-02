const URL_API_SHEETS = "https://script.google.com/macros/s/AKfycbzpr0VjfX32CLya2NmT9I3psJu2d9RzB__wIJ910PEiGdZpOiDF_AK5J1Eq0afs_qhe/exec";
let solicitudes = [];
let solicitudesFiltradas = [];
let solicitudDetalleActual = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('formSolicitud')?.addEventListener('submit', guardarEnGoogleSheets);
  document.getElementById('btnActualizar')?.addEventListener('click', cargarSolicitudes);
  document.getElementById('btnExportar')?.addEventListener('click', exportarExcel);
  document.getElementById('btnLimpiarFiltros')?.addEventListener('click', limpiarFiltros);
  ['filtroTexto','filtroEstado','filtroMaquina'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', aplicarFiltros);
    document.getElementById(id)?.addEventListener('change', aplicarFiltros);
  });
  actualizarColores();
  cargarSolicitudes();
});

async function cargarSolicitudes() {
  mostrarEstadoTabla('Cargando solicitudes...', true);
  try {
    const response = await fetch(URL_API_SHEETS + '?t=' + Date.now());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(data.message || 'Formato de respuesta inválido');
    solicitudes = data.map(normalizarSolicitud);
    solicitudesFiltradas = [...solicitudes];
    actualizarKPI(solicitudesFiltradas);
    poblarFiltroMaquinas(solicitudes);
    renderTabla(solicitudesFiltradas);
  } catch (err) {
    console.error(err);
    mostrarEstadoTabla('No se pudieron cargar las solicitudes: ' + err.message, true);
  }
}

async function guardarEnGoogleSheets(e) {
  e.preventDefault();
  const btn = document.getElementById('btnGuardar');
  const original = btn?.innerHTML || 'Guardar';
  const val = id => document.getElementById(id)?.value || '';
  const payload = {
    cliente:val('cliente'), producto:val('producto'), solicitadoPor:val('solicitadoPor'), prioridad:val('prioridad'),
    fechaRequerida:val('fechaRequerida'), maquina:val('maquina'), material:val('material'), acabado:val('acabado'),
    ancho:val('ancho'), largo:val('largo'), presentacion:val('presentacion'), salidaRollo:val('salidaRollo'),
    cornerRadio:val('cornerRadio'), troquel:val('troquel'), color1:val('color1'), color2:val('color2'), color3:val('color3'),
    color4:val('color4'), color5:val('color5'), color6:val('color6'), color7:val('color7'), color8:val('color8'),
    observaciones:val('observaciones')
  };
  if (!payload.cliente || !payload.producto) { alert('⚠️ Debe completar Cliente y Producto.'); return; }
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; }
  try {
    const response = await fetch(URL_API_SHEETS, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload)});
    const data = await response.json();
    if (data.status !== 'success') throw new Error(data.message || 'Google Sheets rechazó la solicitud');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalSolicitud')).hide();
    document.getElementById('formSolicitud')?.reset();
    actualizarColores();
    alert('🎉 ¡Solicitud enviada correctamente! Estado: PENDIENTE');
    await cargarSolicitudes();
  } catch(err) {
    console.error(err);
    alert('❌ No se pudo guardar la solicitud: ' + err.message);
  } finally { if(btn){btn.disabled=false;btn.innerHTML=original;} }
}

function normalizarSolicitud(raw) {
  const s=raw||{};
  return {
    id:valor(s,['id','ID','no','No.']), cliente:valor(s,['cliente','Cliente']), producto:valor(s,['producto','Producto']),
    fecha:valor(s,['fecha','Fecha']), arte:valor(s,['arte','Arte','archivo','Archivo','referencia','Referencia','archivoNombre','Archivo Nombre']),
    archivoNombre:valor(s,['archivoNombre','Archivo Nombre']), solicitadoPor:valor(s,['solicitadoPor','Solicitado Por']), maquina:valor(s,['maquina','Máquina','Maquina']),
    estado:(valor(s,['estado','Estado','status','Status'])||'PENDIENTE').toString().toUpperCase(), prioridad:(valor(s,['prioridad','Prioridad'])||'NORMAL').toString().toUpperCase(),
    material:valor(s,['material','Material']), acabado:valor(s,['acabado','Acabado']), ancho:valor(s,['ancho','Ancho']), largo:valor(s,['largo','Largo']),
    presentacion:valor(s,['presentacion','Presentación']), salidaRollo:valor(s,['salidaRollo','Salida de Rollo']), cornerRadio:valor(s,['cornerRadio','Corner Radio']),
    troquel:valor(s,['troquel','Troquel']), fechaRequerida:valor(s,['fechaRequerida','Fecha Requerida']), observaciones:valor(s,['observaciones','Observaciones']),
    comentarioArte:valor(s,['comentarioArte','Comentario Arte']), color1:valor(s,['color1','Color 1']), color2:valor(s,['color2','Color 2']), color3:valor(s,['color3','Color 3']),
    color4:valor(s,['color4','Color 4']), color5:valor(s,['color5','Color 5']), color6:valor(s,['color6','Color 6']), color7:valor(s,['color7','Color 7']), color8:valor(s,['color8','Color 8']), raw:s
  };
}
function valor(obj,keys){for(const k of keys) if(obj[k]!==undefined&&obj[k]!==null&&String(obj[k]).trim()!=='') return obj[k];return '';}
function actualizarKPI(data){const estados=data.map(s=>s.estado); document.getElementById('kpiPendientes').textContent=estados.filter(x=>x==='PENDIENTE'||x==='PENDIENTES').length; document.getElementById('kpiProceso').textContent=estados.filter(x=>x.includes('PROCESO')||x==='EN DISEÑO'||x==='ASIGNADA').length; document.getElementById('kpiFinalizados').textContent=estados.filter(x=>x.includes('FINAL')).length; document.getElementById('kpiUrgentes').textContent=data.filter(s=>s.prioridad==='URGENTE').length;}
function poblarFiltroMaquinas(data){const el=document.getElementById('filtroMaquina');if(!el)return;const actual=el.value;const ms=[...new Set(data.map(s=>s.maquina).filter(Boolean))].sort();el.innerHTML='<option value="">Todas las máquinas</option>'+ms.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');if(ms.includes(actual))el.value=actual;}
function aplicarFiltros(){const t=document.getElementById('filtroTexto')?.value.trim().toLowerCase()||'',e=document.getElementById('filtroEstado')?.value||'',m=document.getElementById('filtroMaquina')?.value||'';solicitudesFiltradas=solicitudes.filter(s=>{const estado=(s.estado||'').toUpperCase();if(estado.includes('FINAL'))return false;const b=[s.id,s.cliente,s.producto,s.solicitadoPor,s.maquina,s.material,s.estado,s.prioridad].join(' ').toLowerCase();return(!t||b.includes(t))&&(!e||estadoCoincide(estado,e))&&(!m||s.maquina===m)});renderTabla(solicitudesFiltradas);}
function estadoCoincide(a,f){a=(a||'').toUpperCase();if(f==='PENDIENTE')return a==='PENDIENTE'||a==='PENDIENTES';if(f==='EN PROCESO')return a.includes('PROCESO')||a==='EN DISEÑO'||a==='ASIGNADA';if(f==='FINALIZADO')return a.includes('FINAL');return a===f;}
function actualizarColores(){const el=document.getElementById('maquina');if(!el)return;const max={MARKANDY:1,DIGITAL:4,ZTJ330:5,FIT:6,SPS4:8}[el.value]||0;for(let i=1;i<=8;i++){const c=document.getElementById('color'+i);if(c){c.disabled=i>max;if(i>max)c.value='';}}}
function renderTabla(data){const tbody=document.getElementById('tablaSolicitudes');if(!tbody)return;tbody.innerHTML='';document.getElementById('contadorSolicitudes').textContent=`${data.length} solicitud${data.length===1?'':'es'}`;if(!data.length){mostrarEstadoTabla('No hay solicitudes que coincidan con los filtros.',true);return;}mostrarEstadoTabla('',false);data.forEach((s,index)=>{const tr=document.createElement('tr');const estadoBadge=badgeEstado(s.estado);tr.innerHTML=`<td><strong>#${escapeHtml(s.id)}</strong></td><td>${escapeHtml(s.cliente)}</td><td>${escapeHtml(s.producto)}</td><td>${escapeHtml(formatearFecha(s.fecha))}</td><td>${escapeHtml(s.solicitadoPor)}</td><td>${escapeHtml(s.maquina)}</td><td>${estadoBadge}</td><td><button class="btn btn-primary btn-sm" onclick="verSolicitud(${index})"><i class="fa-solid fa-eye"></i> Ver</button></td>`;tbody.appendChild(tr);});}
function badgeEstado(e){const cls=e==='PENDIENTE'?'warning':e.includes('FINAL')?'success':e==='URGENTE'?'danger':'info';return `<span class="badge text-bg-${cls}">${escapeHtml(e)}</span>`;}
function mostrarEstadoTabla(msg,show){const el=document.getElementById('estadoTabla');if(!el)return;el.querySelector('p').textContent=msg;el.classList.toggle('d-none',!show);}
function escapeHtml(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function formatearFecha(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('es-SV',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}

function verSolicitud(index){
  const s=solicitudesFiltradas[index]; if(!s)return;
  solicitudDetalleActual=s;
  document.getElementById('detalleTitulo').textContent=`Solicitud #${s.id}`;
  document.getElementById('detalleSubtitulo').textContent=`${s.cliente||''} · ${s.producto||''}`;
  const campos=[['Cliente',s.cliente],['Producto',s.producto],['Solicitado por',s.solicitadoPor],['Prioridad',s.prioridad],['Fecha de registro',formatearFecha(s.fecha)],['Fecha requerida',s.fechaRequerida],['Máquina',s.maquina],['Material',s.material],['Acabado',s.acabado],['Ancho',s.ancho],['Largo',s.largo],['Presentación',s.presentacion],['Salida de rollo',s.salidaRollo],['Corner Radio',s.cornerRadio],['Troquel',s.troquel]];
  document.getElementById('detalleContenido').innerHTML=`<div class="row g-3">${campos.map(([l,v])=>`<div class="col-md-4"><div class="border rounded p-3 h-100 bg-light"><div class="small text-muted mb-1">${escapeHtml(l)}</div><div class="fw-semibold">${escapeHtml(v||'—')}</div></div></div>`).join('')}<div class="col-12"><div class="border rounded p-3 bg-light"><div class="small text-muted mb-1">Colores</div><div>${[1,2,3,4,5,6,7,8].map(i=>s['color'+i]).filter(Boolean).map(v=>`<span class="badge text-bg-secondary me-1 mb-1">${escapeHtml(v)}</span>`).join('')||'—'}</div></div></div><div class="col-12"><div class="border rounded p-3 bg-light"><div class="small text-muted mb-1">Observaciones</div><div style="white-space:pre-wrap">${escapeHtml(s.observaciones||'—')}</div></div></div><div class="col-md-6"><label class="form-label fw-semibold">Estado</label><select id="detalleEstado" class="form-select"><option>PENDIENTE</option><option>EN PROCESO</option><option>FINALIZADO</option><option>RECHAZADO</option></select></div><div class="col-md-6"><label class="form-label fw-semibold">Comentario de Arte</label><textarea id="detalleComentario" class="form-control" rows="2" placeholder="Comentario o avance del diseñador"></textarea></div><div class="col-12 d-flex gap-2 flex-wrap"><button class="btn btn-primary" onclick="guardarCambiosSolicitud()"><i class="fa-solid fa-floppy-disk"></i> Guardar cambios</button><button class="btn btn-success" onclick="marcarComoTerminado()"><i class="fa-solid fa-circle-check"></i> Marcar como terminado</button></div></div>`;
  document.getElementById('detalleEstado').value=['PENDIENTE','EN PROCESO','FINALIZADO','RECHAZADO'].includes(s.estado)?s.estado:'EN PROCESO';
  document.getElementById('detalleComentario').value=s.comentarioArte||'';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalDetalle')).show();
}

async function marcarComoTerminado(){
  if(!solicitudDetalleActual)return;
  const select=document.getElementById('detalleEstado');
  if(select) select.value='FINALIZADO';
  await guardarCambiosSolicitud();
}

async function guardarCambiosSolicitud(){
  if(!solicitudDetalleActual)return;
  const estado=document.getElementById('detalleEstado').value, comentario=document.getElementById('detalleComentario').value;
  try{
    const response=await fetch(URL_API_SHEETS,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'update',id:solicitudDetalleActual.id,estado:estado,comentarioArte:comentario})});
    const data=await response.json(); if(data.status!=='success')throw new Error(data.message||'No se pudo actualizar');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalDetalle')).hide();
    alert('✅ Estado y comentario actualizados.');
    await cargarSolicitudes();
  }catch(err){console.error(err);alert('❌ Error al actualizar: '+err.message);}
}
function limpiarFiltros(){['filtroTexto','filtroEstado','filtroMaquina'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});aplicarFiltros();}
function exportarExcel(){if(!solicitudesFiltradas.length){alert('No hay solicitudes para exportar.');return;}const h=['No.','Cliente','Producto','Fecha','Solicitado Por','Máquina','Estado','Prioridad','Material','Acabado','Ancho','Largo','Presentación','Fecha Requerida','Observaciones','Comentario Arte'];const rows=solicitudesFiltradas.map(s=>[s.id,s.cliente,s.producto,formatearFecha(s.fecha),s.solicitadoPor,s.maquina,s.estado,s.prioridad,s.material,s.acabado,s.ancho,s.largo,s.presentacion,s.fechaRequerida,s.observaciones,s.comentarioArte]);const csv=[h,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));a.download='solicitudes_RUA.csv';a.click();}
