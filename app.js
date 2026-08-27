// URL real generada por tu Google Apps Script
const URL_API_SHEETS = "https://script.google.com/macros/s/AKfycbxHyae7m1mdlTMQjYuLKLHNpyEViLaZqxcDXLZ02AmzWXZyKokMuFwtyrJ12VM2c85L/exec";

function guardarEnGoogleSheets() {
    // 1. Recolectar de forma exacta los valores del formulario modal
    const payload = {
        cliente: document.getElementById('cliente').value.trim(),
        producto: document.getElementById('producto').value.trim(),
        solicitadoPor: document.getElementById('solicitadoPor').value.trim(),
        maquina: document.getElementById('maquina').value,
        material: document.getElementById('material').value,
        acabado: document.getElementById('acabado').value,
        ancho: document.getElementById('ancho').value.trim(),
        largo: document.getElementById('largo').value.trim(),
        presentacion: document.getElementById('presentacion').value,
        salidaRollo: document.getElementById('salidaRollo').value
    };

    // 2. Validación básica para no enviar filas vacías obligatorias
    if (!payload.cliente || !payload.producto) {
        alert("⚠️ Por favor, completa los campos obligatorios: Cliente y Producto.");
        return;
    }

    // 3. Capturar el botón de guardar para mostrar estado de carga
    const btnGuardar = event ? event.target.closest('button') : null;
    let textoOriginal = "";
    if (btnGuardar) {
        textoOriginal = btnGuardar.innerHTML;
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    }

    // 4. Petición POST hacia la Web App de Google
    fetch(URL_API_SHEETS, {
        method: "POST",
        mode: "cors",
        headers: {
            "Content-Type": "text/plain;charset=utf-8" // Evita conflictos estrictos de CORS pre-flight en Apps Script
        },
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) throw new Error("Error en la respuesta de red");
        return res.json();
    })
    .then(data => {
        if (data.status === "success") {
            alert("🎉 ¡Solicitud guardada con éxito en Google Sheets!");
            
            // Limpiar los campos del formulario modal
            document.querySelectorAll('.modal-body input, .modal-body select').forEach(el => el.value = '');
            
            // Cerrar el modal automáticamente usando Bootstrap
            const modalEl = document.getElementById('modalSolicitud');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            // Recargar la ventana para actualizar datos si es necesario
            location.reload();
        } else {
            alert("❌ Error del servidor de Google: " + data.message);
        }
    })
    .catch(err => {
        console.error("Error de conexión:", err);
        alert("❌ No se pudo conectar con el servidor. Revisa tu conexión a internet.");
    })
    .finally(() => {
        // 5. Devolver el botón a su estado normal
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = textoOriginal;
        }
    });
}

// Funciones adicionales necesarias para evitar errores de ejecución en la consola
function actualizarColores() {
    console.log("Máquina seleccionada: " + document.getElementById('maquina').value);
}

function verFormulario(cliente, producto, solicitado, maquina, fecha) {
    alert("Visualizando orden para: " + cliente + " (" + producto + ")");
}
