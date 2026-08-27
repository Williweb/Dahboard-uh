const solicitudes = [

{
id:12001,
cliente:"QUICKPRINT",
descripcion:"CAJA RHINO UNITARIA",
fecha:"26/08/2026",
arte:true,
mecanico:true,
dummie:false,
muestra:false,
prioridad:"Alta",
estado:"Proceso"
},

{
id:12002,
cliente:"INTERMODA",
descripcion:"CAJA 450X310X335",
fecha:"26/08/2026",
arte:true,
mecanico:false,
dummie:false,
muestra:false,
prioridad:"Media",
estado:"Pendiente"
},

{
id:12003,
cliente:"HIMESA",
descripcion:"CAJA PALET",
fecha:"26/08/2026",
arte:true,
mecanico:true,
dummie:true,
muestra:true,
prioridad:"Baja",
estado:"Finalizado"
}

];

function icono(valor){

return valor
?
'<i class="fa-solid fa-circle-check"></i>'
:
'<i class="fa-solid fa-circle-xmark"></i>';

}

function cargarTabla(){

let tbody = '';

solicitudes.forEach(item=>{

tbody += `

<tr>

<td>${item.id}</td>
<td>${item.cliente}</td>
<td>${item.descripcion}</td>
<td>${item.fecha}</td>

<td>${icono(item.arte)}</td>
<td>${icono(item.mecanico)}</td>
<td>${icono(item.dummie)}</td>
<td>${icono(item.muestra)}</td>

<td>${item.prioridad}</td>
<td>${item.estado}</td>

<td>

<button class="btn btn-sm btn-secondary">

<i class="fa-solid fa-ellipsis-vertical"></i>

</button>

</td>

</tr>

`;

});

$('#tablaSolicitudes tbody').html(tbody);

new DataTable('#tablaSolicitudes');

}

function cargarKPIs(){

document.getElementById('pendientes').innerText =
solicitudes.filter(x=>x.estado==="Pendiente").length;

document.getElementById('proceso').innerText =
solicitudes.filter(x=>x.estado==="Proceso").length;

document.getElementById('finalizados').innerText =
solicitudes.filter(x=>x.estado==="Finalizado").length;

document.getElementById('urgentes').innerText =
solicitudes.filter(x=>x.prioridad==="Alta").length;

}

window.onload=()=>{

cargarTabla();
cargarKPIs();

};