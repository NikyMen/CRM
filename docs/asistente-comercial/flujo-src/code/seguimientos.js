// Cada hora: recordatorios a quien no volvió a escribir. Como máximo 2 por chat en toda la charla:
// el primero a las `seguimientoHoras` del último mensaje del bot y, solo a quien ya recibió la
// información, un segundo a los 5 días ofreciendo una llamada. Nunca a quien dijo "por ahora no",
// a chats que ya atiende una persona ni a números internos.
const cfg = $('Config').first().json;
if (cfg.seguimientoActivo !== true || cfg.botActivo === false) return [];

const ahora = $now.setZone(cfg.zonaHoraria || 'America/Asuncion');
const hhmm = ahora.toFormat('HH:mm');
// Solo de lunes a viernes, aunque la oficina atienda los sábados.
const dias = String(cfg.atencionDias ?? '1,2,3,4,5').split(',').map((d) => Number(d.trim())).filter((d) => d >= 1 && d <= 5);
if (!dias.includes(ahora.weekday) || hhmm < cfg.seguimientoDesde || hhmm > cfg.seguimientoHasta) return [];

const last9 = (v) => String(v ?? '').replace(/\D/g, '').slice(-9);
const lista = (v) => String(v ?? '').split(/[,;\s]+/).map(last9).filter(Boolean);
const prueba = lista(cfg.soloPrueba);
const excluidos = [...lista(cfg.excluir), last9(cfg.notificarA)].filter(Boolean);
// Chats que en el CRM atiende una persona («Atiende una persona»): sin seguimientos.
let conPersona = [];
try { conPersona = ($('CRM: chats que atiende una persona').first().json.phones ?? []).map(last9); } catch { conPersona = []; }

const now = Date.now();
const H = 3600e3;
const primero = (Number(cfg.seguimientoHoras) || 24) * H;
const SEGUNDO = 5 * 24 * H;
const SEGUIR = ['NUEVO', 'CALIFICANDO', 'COSTOS_ENVIADOS'];
const out = [];

const plantilla = (t, nombre) => t.split('{{nombre}}').join(nombre).replace(/ +,/g, ',').replace(/  +/g, ' ').trim();

for (const { json: row } of $input.all()) {
  if (!row?.estado) continue;
  let e;
  try { e = JSON.parse(row.estado); } catch { continue; }
  if (!e.phone || !SEGUIR.includes(e.stage)) continue;
  if (e.noSeguir || e.lastHumanAt) continue; // dijo que no, o ya lo atiende una persona
  if (e.pausedUntil && e.pausedUntil > now) continue;
  if (e.seguirDesde && e.seguirDesde > now) continue;
  if (!e.lastOutAt || !e.lastInAt || e.lastInAt > e.lastOutAt) continue; // el cliente habló último: no corresponde
  if (excluidos.includes(last9(e.phone))) continue;
  if (conPersona.includes(last9(e.phone))) continue;
  if (prueba.length && !prueba.includes(last9(e.phone))) continue;

  // Chats de antes de este cambio (sin `followUps`): si ya recibieron un seguimiento no reciben
  // más, porque no se sabe si después dijeron que no.
  if (e.followUps === undefined && e.followUpSent) continue;
  const enviados = Number(e.followUps) || 0;
  const recibioInfo = e.stage === 'COSTOS_ENVIADOS' || Boolean(e.brochureAt || e.priced);
  const silencio = now - e.lastOutAt;
  let tipo = null;
  if (enviados === 0 && silencio >= primero && silencio <= 72 * H) tipo = 'primero';
  else if (enviados === 1 && recibioInfo && silencio >= SEGUNDO && silencio <= 8 * 24 * H) tipo = 'segundo';
  if (!tipo) continue;

  // Solo el nombre que dijo la persona (el de perfil de WhatsApp suele ser un apodo o un comercio).
  const pila = String(e.lead?.nombre || '').trim().split(/\s+/)[0];
  const esNombre = /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{3,15}$/.test(pila) && pila !== pila.toUpperCase()
    && !['abg', 'abog', 'dr', 'dra', 'lic', 'ing', 'sr', 'sra'].includes(pila.toLowerCase());
  const nombre = esNombre ? pila[0].toUpperCase() + pila.slice(1).toLowerCase() : '';

  let texto;
  if (tipo === 'segundo') {
    texto = 'Buenas {{nombre}}, ¿pudo avanzar con la decisión sobre su empresa? Si quiere, el Lic. José Rojas le llama para aclarar dudas, sin compromiso: solo responda «sí» 🙌';
  } else if (recibioInfo) {
    texto = cfg.mensajeSeguimiento || 'Buenas {{nombre}}, le escribe nuevamente el equipo de la Consultora ROMEZ. ¿Pudo revisar la información que le enviamos? Si le quedó alguna duda, con gusto se la resuelvo 🙌';
  } else {
    texto = 'Buenas {{nombre}}, le escribe nuevamente el equipo de la Consultora ROMEZ. ¿Le paso el costo y lo que incluye la creación de una EAS? 🙌';
  }

  e.followUps = enviados + 1;
  e.followUpSent = true;
  e.lastFollowUpAt = now;
  e.ultimaPregunta = true;
  e.lastOutAt = now;
  e.lastBotAt = now;
  out.push({ json: { phone: e.phone, to: '+' + e.phone, text: plantilla(texto, nombre), estado: JSON.stringify(e) } });
}
return out;
