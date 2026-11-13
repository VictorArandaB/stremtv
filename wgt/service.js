// Servicio de fondo de StremTV para el Smart Hub Preview (las casillas que la tele enseña sobre la app en la barra
// de aplicaciones). No sabe nada de la app: recibe de ella el JSON ya hecho (dato «preview») y se lo da a la tele.
// La tele también lo arranca sola cada cierto tiempo, sin datos: entonces no hay nada que hacer y se cierra
// (las casillas puestas se quedan). Va en el paquete (service.js): no se actualiza solo como app.js.
function done() {
  try { tizen.application.getCurrentApplication().exit(); } catch (e) { /* ya cerrado */ }
}

module.exports.onStart = function () {};

module.exports.onRequest = function () {
  var json = '';
  try {
    var data = tizen.application.getCurrentApplication().getRequestedAppControl().appControl.data || [];
    for (var i = 0; i < data.length; i++) if (data[i].key === 'preview') json = data[i].value[0];
  } catch (e) { json = ''; }
  if (!json) { done(); return; }
  try {
    webapis.preview.setPreviewData(json, done, done);
  } catch (e) { done(); }
};

module.exports.onExit = function () {};
