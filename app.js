function doPost(e) {
  try {

    // Verificar que lleguen datos
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: "error",
          message: "No se recibieron datos."
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Convertir JSON recibido
    var datos = JSON.parse(e.postData.contents);

    // Abrir Spreadsheet
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = libro.getSheetByName("Solicitudes");

    // Verificar que exista la hoja
    if (!hoja) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: "error",
          message: "No existe la hoja 'Solicitudes'."
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Guardar solicitud
    hoja.appendRow([
      new Date(),
      datos.cliente || "",
      datos.producto || "",
      datos.solicitadoPor || "",
      datos.prioridad || "",
      datos.fechaRequerida || "",
      datos.maquina || "",
      datos.material || "",
      datos.acabado || "",
      datos.ancho || "",
      datos.largo || "",
      datos.presentacion || "",
      datos.salidaRollo || "",
      datos.cornerRadio || "",
      datos.troquel || "",
      datos.color1 || "",
      datos.color2 || "",
      datos.color3 || "",
      datos.color4 || "",
      datos.color5 || "",
      datos.color6 || "",
      datos.color7 || "",
      datos.color8 || "",
      datos.observaciones || "",
      datos.archivoNombre || ""
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({
        status: "success",
        message: "Datos guardados correctamente."
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {

    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ========================================
// OBTENER SOLICITUDES PARA EL DASHBOARD
// ========================================

function doGet(e) {

  try {

    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = libro.getSheetByName("Solicitudes");

    if (!hoja) {
      return ContentService
        .createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var datos = hoja.getDataRange().getValues();

    // Si solo existen encabezados
    if (datos.length <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var encabezados = datos[0];
    var jsonResultado = [];

    for (var i = 1; i < datos.length; i++) {

      var fila = datos[i];
      var objeto = {};

      for (var j = 0; j < encabezados.length; j++) {

        var propiedad = encabezados[j]
          .toString()
          .trim();

        // Convertir:
        // "Solicitado Por" → "solicitadoPor"
        propiedad = propiedad
          .toLowerCase()
          .replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
            if (+match === 0) return "";
            return index === 0
              ? match.toLowerCase()
              : match.toUpperCase();
          });

        objeto[propiedad] = fila[j];
      }

      jsonResultado.push(objeto);
    }

    return ContentService
      .createTextOutput(JSON.stringify(jsonResultado))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {

    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
