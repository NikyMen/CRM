// Une la configuración del nodo «Config base» con la que lee el CRM (panel /asistente).
// Si el CRM respondió, sus valores mandan (interruptor, teléfonos de prueba, horarios, límites) y
// aportan los servicios con precio; si no respondió o está apagado, valen los de «Config base».
const base = $('Config base').first().json;
const remote = $input.first().json ?? {};
const out = { ...base };

const crm = remote && typeof remote.config === 'object' && remote.config !== null ? remote : null;
if (crm) {
  for (const [clave, valor] of Object.entries(crm.config)) {
    if (valor !== undefined && valor !== null) out[clave] = valor;
  }
  out.bloques = crm.bloques ?? {};
  out.catalogo = crm.catalogo ?? {};
  out.sinTarifa = Array.isArray(crm.sinTarifa) ? crm.sinTarifa : [];
  out.instruccionesExtra = String(crm.instruccionesExtra ?? '');
  out.mensajeFallback = String(crm.mensajeFallback ?? '');
  out.mensajeSeguimiento = String(crm.mensajeSeguimiento ?? '');
  out.configOrigen = 'crm';
} else {
  out.configOrigen = base.crmConfigActivo === true ? 'base (el CRM no respondió)' : 'base';
}

return [{ json: out }];
