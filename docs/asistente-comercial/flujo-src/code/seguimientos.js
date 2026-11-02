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
const minimo = (Number(cfg.seguimientoHoras) || 22) * 3600e3;
const out = [];

for (const { json: row } of $input.all()) {
  if (!row?.estado) continue;
  let e;
  try { e = JSON.parse(row.estado); } catch { continue; }
  if (!e.phone || e.stage !== 'COSTOS_ENVIADOS' || e.followUpSent) continue;
  if (e.pausedUntil && e.pausedUntil > now) continue;
  if (!e.lastOutAt || !e.lastInAt || e.lastInAt > e.lastOutAt) continue; // el cliente habló último: no corresponde
  const silencio = now - e.lastOutAt;
  if (silencio < minimo || silencio > 72 * 3600e3) continue;
  if (excluidos.includes(last9(e.phone))) continue;
  if (prueba.length && !prueba.includes(last9(e.phone))) continue;

  const nombre = (e.lead?.nombre || e.name || '').split(' ')[0];
  const plantilla = cfg.mensajeSeguimiento || 'Buenas {{nombre}}, le escribe nuevamente el equipo de la Consultora ROMEZ. ¿Pudo revisar la información que le enviamos? Si le quedó alguna duda, avíseme y con gusto se la resuelvo 🙌';
  // {{nombre}} se reemplaza por el primer nombre; si no se conoce, se omite.
  const text = plantilla.split('{{nombre}}').join(nombre).replace(/ +,/g, ',').replace(/  +/g, ' ').trim();

  e.followUpSent = true;
  e.lastOutAt = now;
  e.lastBotAt = now;
  out.push({ json: { phone: e.phone, to: '+' + e.phone, text, estado: JSON.stringify(e) } });
}
return out;
