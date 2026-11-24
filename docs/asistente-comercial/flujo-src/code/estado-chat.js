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

// «Forzar IA» desde el CRM: el chat vuelve al asistente y se contesta ya lo pendiente
// (el texto ya trae juntos los mensajes del cliente que quedaron sin respuesta).
if (msg.force) {
  delete e.pausedUntil;
  e.humano = false;
  e.forcedAt = now;
}
// Cortesías que cierran la charla ("gracias", "igualmente 🙏"): no se contestan para no sumar otro
// "quedamos a disposición". Un "ok / dale / perfecto" solo se ignora si el bot no había hecho una
// pregunta: si la hizo, es una respuesta ("¿Quiere avanzar?" → "Dale") y hay que atenderla.
const agradece = /^(?:\s*(?:muchas gracias|muchaa? gracias|mil gracias|gracias a (?:usted|vos|ustedes)|gracias|igualmente|jaja|ja|👍|🙏|🙌|😊|🫡|\.)\s*[,!.]*\s*)+$/i;
const asiente = /^(?:\s*(?:muchas gracias|gracias|igualmente|okey|okis|oka|ok|dale|listo|bueno|perfecto|excelente|genial|entendido|entiendo|👍|🙏|🙌|\.)\s*[,!.]*\s*)+$/i;
const trivial = { test: (t) => agradece.test(t) || (!e.ultimaPregunta && asiente.test(t)) };

if (duplicado) { responder = false; motivo = 'duplicado'; }
else if (cfg.botActivo === false) { responder = false; motivo = 'bot_apagado'; }
else if (e.pausedUntil && e.pausedUntil > now) { responder = false; motivo = 'pausado_por_persona'; }
else if (msg.force) { /* lo pidió una persona del equipo: sin tope por hora ni filtro de cortesías */ }
else if (e.hist.length >= (Number(cfg.maxRespuestasPorHora) > 0 ? Number(cfg.maxRespuestasPorHora) : 10)) {
  // Corta cualquier bucle o abuso: tope de respuestas por hora (configurable, 10 por defecto).
  responder = false; motivo = 'limite_por_hora'; e.pausedUntil = now + 2 * 3600e3;
}
else if (msg.kind === 'text' && trivial.test(msg.text) && (e.botReplies || 0) > 0) {
  responder = false; motivo = 'mensaje_de_cortesia';
}
else if (msg.kind === 'sticker' && (e.botReplies || 0) > 0) {
  responder = false; motivo = 'sticker';
}

return [{ json: { ...msg, e, estado: JSON.stringify(e), responder, motivo } }];
