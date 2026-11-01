// Valida la salida del modelo, arma los mensajes a enviar y actualiza la ficha del chat.
const cfg = $('Config').first().json;
const ficha = $('Ficha de servicios').first().json;
const ctx = $('Armar contexto IA').first().json;
const last = $('¿Último mensaje?').first().json;
const e = last.e ?? {};
const ai = $input.first().json ?? {};
const now = Date.now();

const STAGES = ['NUEVO', 'CALIFICANDO', 'COSTOS_ENVIADOS', 'DOCUMENTACION', 'LISTO_PARA_INICIAR', 'DERIVADO', 'DESCARTADO'];
const clean = (v) => String(v ?? '').replace(/\r/g, '').trim();
const SIN_IA = 'Disculpe, en este momento no puedo darle la información. Le paso con el Lic. José Rojas, que le responde a la brevedad 🙏';

// 1) Parseo tolerante (el modelo puede envolver el JSON en ```).
const rawOut = clean(ai.output ?? ai.text ?? '');
let p = null;
try {
  const i = rawOut.indexOf('{');
  const j = rawOut.lastIndexOf('}');
  p = JSON.parse(rawOut.slice(i, j + 1));
} catch { p = null; }
const fallback = p === null;
if (fallback) p = { needs_human: true, human_reason: 'FALLA_IA', reply_parts: [SIN_IA], blocks: [], stage: 'DERIVADO' };

// 2) Red de seguridad: un precio escrito "a mano" por el modelo se descarta (solo valen los bloques).
const tienePrecio = (t) => /\bGs\.?\s*\d|\d{1,3}(?:\.\d{3})+/.test(t);
const descartados = [];
const parts = (Array.isArray(p.reply_parts) ? p.reply_parts : [])
  .map(clean).filter(Boolean)
  .filter((t) => { if (tienePrecio(t)) { descartados.push(t); return false; } return true; })
  .slice(0, 2);
let closing = clean(p.closing);
if (tienePrecio(closing)) { descartados.push(closing); closing = ''; }

// 3) Bloques: solo códigos conocidos y no repetidos en 6 h.
const bloquesPrevios = e.bloques ?? {};
const bloques = [...new Set(Array.isArray(p.blocks) ? p.blocks : [])]
  .filter((k) => ficha.bloques[k] && !(bloquesPrevios[k] && now - bloquesPrevios[k] < 6 * 3600e3))
  .slice(0, 5);

let needsHuman = p.needs_human === true;
let reason = clean(p.human_reason) || null;
// Si descartamos un precio y no queda nada útil, mejor una persona.
if (!parts.length && !bloques.length && !closing) {
  needsHuman = true; reason = reason || 'SIN_RESPUESTA_UTIL';
  parts.push(descartados.length ? 'Permítame un momento, le paso con el Lic. José Rojas para confirmarle ese dato 🙏' : SIN_IA);
}

const textos = [...parts, ...bloques.map((k) => ficha.bloques[k]), ...(closing ? [closing] : [])];
const to = '+' + ctx.phone;
const mensajes = textos.map((text) => ({ to, text }));

// 4) Ficha del chat.
for (const [k, v] of Object.entries(p.lead ?? {})) {
  if (v !== null && v !== undefined && clean(v) !== '') e.lead = { ...(e.lead ?? {}), [k]: v };
}
if (!e.name && e.lead?.nombre) e.name = e.lead.nombre;
e.intent = clean(p.intent) || e.intent || null;
e.stage = needsHuman ? 'DERIVADO' : (STAGES.includes(p.stage) ? p.stage : (e.stage || 'CALIFICANDO'));
if (bloques.includes('EAS_COSTO')) e.priced = true;
e.bloques = { ...bloquesPrevios };
for (const k of bloques) e.bloques[k] = now;
e.hist = [...(e.hist ?? []), now];
e.botReplies = (e.botReplies || 0) + 1;
e.lastBotAt = now;
e.lastOutAt = now;
e.followUpSent = false;
if (needsHuman) {
  const horas = Number(cfg.pausaHoras) > 0 ? Number(cfg.pausaHoras) : 8;
  e.pausedUntil = now + horas * 3600e3;
  e.derivadoMotivo = reason;
}

// 5) Aviso interno y sincronización opcional con el CRM.
const lead = e.lead ?? {};
const aviso = needsHuman
  ? [
      '🔔 Lead para atender',
      `Nombre: ${lead.nombre || e.name || ctx.name || 'sin dato'}`,
      `Teléfono: +${ctx.phone}`,
      `Interés: ${lead.tipo || e.intent || 'sin dato'}${lead.rubro ? ' · rubro: ' + lead.rubro : ''}`,
      `Motivo: ${reason || 'sin dato'}`,
      `Etapa: ${e.stage}`,
      `Último mensaje: "${clean(last.text).slice(0, 300)}"`,
      ctx.enHorario ? '' : '(Entró fuera de horario de atención)',
    ].filter(Boolean).join('\n')
  : '';

const crmSync = cfg.crmActivo === true && Boolean(lead.nombre || e.name);
const crm = crmSync ? {
  firstName: String(lead.nombre || e.name).slice(0, 80),
  phone: '+' + ctx.phone,
  source: 'WHATSAPP_COMERCIAL',
  tags: ['asistente-whatsapp', lead.tipo ? String(lead.tipo).toLowerCase() : 'consulta'],
  customData: { rubro: lead.rubro ?? null, ciudad: lead.ciudad ?? null, etapa: e.stage, tieneRuc: lead.tiene_ruc ?? null },
  upsert: true,
} : null;

return [{
  json: {
    phone: ctx.phone,
    mensajes,
    estado: JSON.stringify(e),
    handoff: needsHuman,
    aviso,
    avisoTo: cfg.notificarA ? '+' + String(cfg.notificarA).replace(/\D/g, '') : '',
    crmSync,
    crm,
    meta: { fallback, descartados, bloques, stage: e.stage },
  },
}];
