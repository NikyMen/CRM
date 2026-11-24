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
const SIN_IA = ficha.mensajeFallback || 'Disculpe, en este momento no puedo darle la información. Le paso con el Lic. José Rojas, que le responde a la brevedad 🙏';
const textoCliente = clean(last.text);

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
let parts = (Array.isArray(p.reply_parts) ? p.reply_parts : [])
  .map(clean).filter(Boolean)
  .filter((t) => { if (tienePrecio(t)) { descartados.push(t); return false; } return true; });
let closing = clean(p.closing);
if (tienePrecio(closing)) { descartados.push(closing); closing = ''; }

// 3) Bloques: solo códigos conocidos y no repetidos en 6 h.
const bloquesPrevios = e.bloques ?? {};
const bloques = [...new Set(Array.isArray(p.blocks) ? p.blocks : [])]
  .filter((k) => ficha.bloques[k] && !(bloquesPrevios[k] && now - bloquesPrevios[k] < 6 * 3600e3))
  .slice(0, 3);

let needsHuman = p.needs_human === true;
let reason = clean(p.human_reason) || null;

// 4) Claves por WhatsApp: el cliente nunca debe mandarlas y no se reenvían en el aviso.
// Una clave escrita ("clave: abc123", "contraseña Pepe2024") o el par usuario/clave típico ("3955602 / Accidente11").
// Preguntar por una clave ("¿necesito clave de Marangatu?") no dispara el aviso.
const PATRON_CLAVE = /\b(clave|contrase(?:ñ|n)a|password)\b\s*(?:es|de acceso)?\s*[:=]?\s*(?=\S*\d)(?=\S*[a-zA-Z])\S{5,}|\b\d{6,8}\s*[\/|]\s*(?=\S*[a-zA-Z])(?=\S*\d)\S{6,}/i;
const envioClaves = PATRON_CLAVE.test(textoCliente);
const AVISO_CLAVES = 'Por su seguridad, le pedimos que no envíe claves ni contraseñas por WhatsApp. El Lic. José Rojas le indicará cómo hacerlo de forma segura 🔒';
if (envioClaves) { needsHuman = true; reason = reason || 'ENVIO_CLAVES'; }

// Si descartamos un precio y no queda nada útil, mejor una persona.
if (!parts.length && !bloques.length && !closing) {
  needsHuman = true; reason = reason || 'SIN_RESPUESTA_UTIL';
  parts.push(descartados.length ? 'Permítame un momento, le paso con el Lic. José Rojas para confirmarle ese dato 🙏' : SIN_IA);
}

// 5) Sin presentación repetida: después de la primera respuesta el bot no vuelve a decir quién es.
const PRESENTACION = /^(?:(?:hola|buen(?:os|as)\s*(?:d[ií]as|tardes|noches)?)[,!. ]*)?soy (?:el )?asistente virtual de (?:la )?consultora romez[.,!]?\s*/i;
if ((e.botReplies || 0) > 0) parts = parts.map((t) => t.replace(PRESENTACION, '').trim()).filter(Boolean);

// 6) El rubro se pregunta UNA sola vez y nunca si ya se sabe, si ya tiene EAS o si se deriva.
const PREGUNTA_RUBRO = /rubro|a qu[eé] se dedica|actividad (principal|econ[oó]mica)?|qu[eé] actividad/i;
const esPregunta = (t) => /\?\s*$/.test(clean(t)) || /¿[^?]*\?/.test(clean(t));
const lead = { ...(e.lead ?? {}) };
for (const [k, v] of Object.entries(p.lead ?? {})) {
  if (v !== null && v !== undefined && clean(v) !== '') lead[k] = v;
}
const rubroBloqueado = Boolean(e.rubroPreguntado || lead.rubro || lead.tiene_eas === true || needsHuman);
const preguntaRubro = (t) => esPregunta(t) && PREGUNTA_RUBRO.test(t);
if (rubroBloqueado) {
  parts = parts.filter((t) => !preguntaRubro(t));
  if (preguntaRubro(closing)) closing = '';
}

// 7) Presentación y brochure en PDF: la primera vez que toca información de la EAS, en lugar de
// los textos largos se envía un mensaje de presentación y los dos PDF (en ese orden).
const EAS_INFO = ['EAS_COSTO', 'EAS_CONTABLE', 'EAS_LIBROS', 'EAS_REQUISITOS'];
const brochures = Array.isArray(ficha.brochures) ? ficha.brochures.filter((b) => b && b.url) : [];
const usarBrochure = brochures.length > 0 && !e.brochureAt && !needsHuman && bloques.some((k) => EAS_INFO.includes(k));
const bloquesTexto = usarBrochure ? bloques.filter((k) => !EAS_INFO.includes(k)) : bloques;
const INTRO_BROCHURE = 'Le comparto nuestra presentación institucional y el detalle de nuestros servicios para EAS, con la inversión, qué incluye, el plazo y los requisitos 📎';
const PREGUNTA_RUBRO_BROCHURE = '¿A qué se dedicaría la empresa? Así le confirmo que la EAS le conviene 🙌';
const CIERRE_BROCHURE = '¿Tiene alguna consulta o le gustaría avanzar con la constitución de su EAS?';

// Lo que anuncia un envío ("le envío…", "le comparto…") sobra cuando el sistema ya manda bloques o PDF.
const ANUNCIO = /\b(le|les) (env[ií]o|comparto|paso|dejo|mando|adjunto)\b|\ba continuaci[oó]n\b/i;
const hayEnvio = bloquesTexto.length > 0 || usarBrochure;
if (hayEnvio) parts = parts.filter((t) => !ANUNCIO.test(t));
// reply_parts nunca termina en pregunta: la única pregunta del turno va en el cierre.
const preguntaEnParts = parts.find(esPregunta);
parts = parts.filter((t) => !esPregunta(t));
if (!closing && preguntaEnParts && !needsHuman) closing = preguntaEnParts;
// Como máximo 1 mensaje propio si se envían bloques o PDF, 2 si no.
parts = parts.slice(0, hayEnvio ? 1 : 2);

let closingFinal = closing;
if (usarBrochure) {
  closingFinal = !rubroBloqueado ? PREGUNTA_RUBRO_BROCHURE : CIERRE_BROCHURE;
}
if (needsHuman && closingFinal && esPregunta(closingFinal)) closingFinal = '';
const preguntoRubroAhora = !rubroBloqueado && preguntaRubro(closingFinal);

const to = '+' + ctx.phone;
// Red final: nunca dos mensajes de texto iguales (ignorando mayúsculas, signos y espacios).
const firma = (t) => clean(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const vistos = new Set();
const mensajes = [
  ...(envioClaves ? [{ to, text: AVISO_CLAVES }] : []),
  ...parts.map((text) => ({ to, text })),
  ...(usarBrochure
    ? [{ to, text: INTRO_BROCHURE }, ...brochures.map((b) => ({ to, documentUrl: b.url, fileName: b.fileName }))]
    : []),
  ...bloquesTexto.map((k) => ({ to, text: ficha.bloques[k] })),
  ...(closingFinal ? [{ to, text: closingFinal }] : []),
].filter((m) => { if (!m.text) return true; const f = firma(m.text); if (vistos.has(f)) return false; vistos.add(f); return true; });

// 8) Ficha del chat.
e.lead = lead;
if (!e.name && e.lead?.nombre) e.name = e.lead.nombre;
e.intent = clean(p.intent) || e.intent || null;
e.stage = needsHuman ? 'DERIVADO' : (STAGES.includes(p.stage) ? p.stage : (e.stage || 'CALIFICANDO'));
if (bloques.includes('EAS_COSTO') || usarBrochure) e.priced = true;
if (usarBrochure) e.brochureAt = now;
if (preguntoRubroAhora) e.rubroPreguntado = now;
// Si el bot cerró con una pregunta, un "ok / dale" siguiente es una respuesta (ver «Estado del chat»).
e.ultimaPregunta = Boolean(closingFinal && esPregunta(closingFinal));
e.bloques = { ...bloquesPrevios };
for (const k of bloques) e.bloques[k] = now;
e.hist = [...(e.hist ?? []), now];
e.botReplies = (e.botReplies || 0) + 1;
e.lastBotAt = now;
e.lastOutAt = now;

// Seguimiento: el cliente que dice "por ahora no" no recibe más recordatorios; el que dice
// "lo analizo / les aviso" recibe como mucho uno, a partir de los 5 días.
const NO_INTERESA = /\b(no me interesa|por ahora no|no gracias|no estoy interesad|prefiero (otra|otro)|vi opciones m[aá]s econ[oó]micas|es (muy )?caro|precio (ya )?(es )?elevado|ya tengo (contador|con otro)|ya estoy tramitando)\b/i;
const MAS_ADELANTE = /\b(lo analizo|lo voy a analizar|analizando|lo pienso|lo voy a pensar|les? aviso|te aviso|le confirmo|le contacto|les contacto|me comunico|lo hablo|lo consulto|m[aá]s adelante|la semana (que viene|entrante|pr[oó]xima)|el (a[nñ]o|mes) que viene|mañana (le|te) paso|cuando pueda)\b/i;
if (NO_INTERESA.test(textoCliente) || e.stage === 'DESCARTADO') e.noSeguir = true;
else if (MAS_ADELANTE.test(textoCliente)) e.seguirDesde = now + 5 * 86400e3;

if (needsHuman) {
  const horas = Number(cfg.pausaHoras) > 0 ? Number(cfg.pausaHoras) : 8;
  e.pausedUntil = now + horas * 3600e3;
  e.derivadoMotivo = reason;
}

// 9) Aviso interno y sincronización opcional con el CRM.
const MOTIVOS = { OBJECION_PRECIO: 'Objeción de precio (conviene llamarlo)', ENVIO_CLAVES: 'Mandó claves por WhatsApp (no reenviarlas)' };
const ultimoParaAviso = envioClaves ? '[contenido oculto: el cliente envió claves]' : textoCliente.slice(0, 300);
const aviso = needsHuman
  ? [
      '🔔 Lead para atender',
      `Nombre: ${lead.nombre || 'sin dato'}${e.name && e.name !== lead.nombre ? ` (perfil: ${e.name})` : ''}`,
      `Teléfono: +${ctx.phone}`,
      `Interés: ${lead.tipo || e.intent || 'sin dato'}${lead.rubro ? ' · rubro: ' + lead.rubro : ''}${lead.tiene_eas ? ' · ya tiene EAS' : ''}`,
      `Motivo: ${MOTIVOS[reason] || reason || 'sin dato'}`,
      `Etapa: ${e.stage}${e.brochureAt ? ' · ya recibió los PDF' : ''}`,
      `Último mensaje: "${ultimoParaAviso}"`,
      ctx.enHorario ? '' : '(Entró fuera de horario de atención)',
    ].filter(Boolean).join('\n')
  : '';

// Número del equipo en formato internacional. Un número local paraguayo (0981…/981…) se
// completa con 595: "+0981…" no existe y WhatsApp descarta el aviso sin dar error.
function avisoTo(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 10) d = '595' + d.slice(1);
  else if (d.startsWith('9') && d.length === 9) d = '595' + d;
  return '+' + d;
}

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
    avisoTo: avisoTo(cfg.notificarA),
    crmSync,
    crm,
    meta: { fallback, descartados, bloques, stage: e.stage, brochure: usarBrochure, envioClaves },
  },
}];
