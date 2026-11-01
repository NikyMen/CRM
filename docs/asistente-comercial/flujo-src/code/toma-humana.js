// Mensaje saliente (fromMe): si no es eco del bot, una persona tomó el chat y el bot se calla.
const cfg = $('Config').first().json;
const msg = $('Normalizar mensaje').first().json;
const row = $input.first().json;
const now = Date.now();

let e = {};
try { e = row.estado ? JSON.parse(row.estado) : {}; } catch { e = {}; }

// wppia reenvía como fromMe lo que el propio bot envía: se ignora durante 90 s.
if (e.lastBotAt && now - e.lastBotAt < 90_000) {
  return [{ json: { guardar: false, motivo: 'eco_del_bot' } }];
}

const horas = Number(cfg.pausaHoras) > 0 ? Number(cfg.pausaHoras) : 8;
e.phone = msg.phone;
e.pausedUntil = now + horas * 3600e3;
e.humano = true;
e.lastHumanAt = now;

return [{ json: { guardar: true, phone: msg.phone, estado: JSON.stringify(e) } }];
