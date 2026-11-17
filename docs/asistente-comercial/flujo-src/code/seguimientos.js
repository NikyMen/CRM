// Cada hora: ofrece UN recordatorio a quien recibió el presupuesto y no volvió a escribir.
const cfg = $('Config').first().json;
if (cfg.seguimientoActivo !== true || cfg.botActivo === false) return [];

const ahora = $now.setZone(cfg.zonaHoraria || 'America/Asuncion');
const hhmm = ahora.toFormat('HH:mm');
const dias = String(cfg.atencionDias ?? '1,2,3,4,5').split(',').map((d) => Number(d.trim()));
if (!dias.includes(ahora.weekday) || hhmm < cfg.seguimientoDesde || hhmm > cfg.seguimientoHasta) return [];

const last9 = (v) => String(v ?? '').replace(/\D/g, '').slice(-9);
const lista = (v) => String(v ?? '').split(/[,;\s]+/).map(last9).filter(Boolean);
const prueba = lista(cfg.soloPrueba);
const excluidos = lista(cfg.excluir);

const now = Date.now();
const minimo = (Number(cfg.seguimientoHoras) || 24) * 3600e3;
const SEGUIR = ['NUEVO', 'CALIFICANDO', 'COSTOS_ENVIADOS'];
const out = [];

for (const { json: row } of $input.all()) {
  if (!row?.estado) continue;
  let e;
  try { e = JSON.parse(row.estado); } catch { continue; }
  // A quien no respondió: ya haya recibido los costos o haya quedado en la primera pregunta.
  if (!e.phone || !SEGUIR.includes(e.stage) || e.followUpSent) continue;
  if (e.pausedUntil && e.pausedUntil > now) continue;
  if (!e.lastOutAt || !e.lastInAt || e.lastInAt > e.lastOutAt) continue; // el cliente habló último: no corresponde
  const silencio = now - e.lastOutAt;
  if (silencio < minimo || silencio > 72 * 3600e3) continue;
  if (excluidos.includes(last9(e.phone))) continue;
  if (prueba.length && !prueba.includes(last9(e.phone))) continue;

  // El nombre de WhatsApp suele ser un apodo o un comercio ("ABORIGEN", ".", "juank👾"):
  // solo se usa si parece un nombre de pila; si no, el saludo va sin nombre.
  const pila = String(e.lead?.nombre || e.name || '').trim().split(/\s+/)[0];
  const esNombre = /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{3,15}$/.test(pila) && pila !== pila.toUpperCase()
    && !['abg', 'abog', 'dr', 'dra', 'lic', 'ing', 'sr', 'sra'].includes(pila.toLowerCase());
  const nombre = esNombre ? pila[0].toUpperCase() + pila.slice(1) : '';
  const plantilla = e.stage === 'COSTOS_ENVIADOS'
    ? (cfg.mensajeSeguimiento || 'Buenas {{nombre}}, le escribe nuevamente el equipo de la Consultora ROMEZ. ¿Pudo revisar la información que le enviamos? Si le quedó alguna duda, avíseme y con gusto se la resuelvo 🙌')
    : 'Buenas {{nombre}}, le escribe nuevamente el equipo de la Consultora ROMEZ. ¿Sigue interesado en constituir su empresa? Si me cuenta a qué rubro se dedicaría, le paso los costos y requisitos 🙌';
  // {{nombre}} se reemplaza por el primer nombre; si no se conoce, se omite.
  const text = plantilla.split('{{nombre}}').join(nombre).replace(/ +,/g, ',').replace(/  +/g, ' ').trim();

  e.followUpSent = true;
  e.lastOutAt = now;
  e.lastBotAt = now;
  out.push({ json: { phone: e.phone, to: '+' + e.phone, text, estado: JSON.stringify(e) } });
}
return out;
