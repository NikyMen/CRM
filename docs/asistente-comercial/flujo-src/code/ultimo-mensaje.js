// Tras la espera: solo sigue la ejecución del ÚLTIMO mensaje de la ráfaga, con todo el texto junto.
const base = $('Texto final').first().json;
const row = $input.first().json;
const now = Date.now();

let e = base.e;
try { if (row.estado) e = JSON.parse(row.estado); } catch { /* usa el estado local */ }

if (String(row.lastMsgId ?? '') !== String(base.messageId)) {
  return [{ json: { continuar: false, motivo: 'llego_otro_mensaje' } }];
}
// Una persona pudo haber tomado el chat mientras esperábamos.
if (e.pausedUntil && e.pausedUntil > now) {
  return [{ json: { continuar: false, motivo: 'pausado_por_persona' } }];
}

const text = String(row.buffer ?? '').trim() || base.text;
return [{ json: { continuar: true, phone: base.phone, name: base.name, kind: base.kind, messageId: base.messageId, text, e } }];
