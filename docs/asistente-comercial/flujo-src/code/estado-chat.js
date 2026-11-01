// Decide si el bot responde este mensaje y actualiza la ficha del chat.
const cfg = $('Config').first().json;
const msg = $('Normalizar mensaje').first().json;
const row = $input.first().json;
const now = Date.now();

let e = {};
try { e = row.estado ? JSON.parse(row.estado) : {}; } catch { e = {}; }

const duplicado = (e.ids ?? []).includes(msg.messageId);
e.phone = msg.phone;
e.name = e.name || msg.name || '';
e.firstAt = e.firstAt || now;
e.stage = e.stage || 'NUEVO';
e.lastInAt = now;
e.inCount = (e.inCount || 0) + 1;
e.ids = [...(e.ids ?? []), msg.messageId].slice(-30);
e.hist = (e.hist ?? []).filter((t) => now - t < 3600e3);

let responder = true;
let motivo = null;
const trivial = /^(ok|oka|okey|okis|dale|listo|gracias|muchas gracias|jaja|ja|👍|🙏|\.)+[\s!.]*$/i;

if (duplicado) { responder = false; motivo = 'duplicado'; }
else if (cfg.botActivo === false) { responder = false; motivo = 'bot_apagado'; }
else if (e.pausedUntil && e.pausedUntil > now) { responder = false; motivo = 'pausado_por_persona'; }
else if (e.hist.length >= 10) {
  // Corta cualquier bucle o abuso: más de 10 respuestas en una hora.
  responder = false; motivo = 'limite_por_hora'; e.pausedUntil = now + 2 * 3600e3;
}
else if (msg.kind === 'text' && trivial.test(msg.text) && (e.botReplies || 0) > 0) {
  responder = false; motivo = 'mensaje_de_cortesia';
}

return [{ json: { ...msg, e, estado: JSON.stringify(e), responder, motivo } }];
