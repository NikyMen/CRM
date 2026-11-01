// Arma el mensaje que recibe el modelo: texto del cliente + lo que ya sabemos + bloques autorizados.
const cfg = $('Config').first().json;
const ficha = $('Ficha de servicios').first().json;
const u = $('¿Último mensaje?').first().json;
const e = u.e ?? {};

const now = $now.setZone('America/Asuncion');
const hhmm = now.toFormat('HH:mm');
const dias = String(cfg.atencionDias ?? '1,2,3,4,5').split(',').map((d) => Number(d.trim()));
const enHorario = dias.includes(now.weekday) && hhmm >= cfg.atencionDesde && hhmm < cfg.atencionHasta;

const sent = Object.entries(e.bloques ?? {})
  .filter(([, t]) => Date.now() - t < 6 * 3600e3)
  .map(([k]) => k);

const lines = [
  '=== MENSAJE DEL CLIENTE ===',
  u.text,
  '',
  '=== AHORA ===',
  `${now.setLocale('es').toFormat("cccc dd/MM/yyyy HH:mm")} (hora de Paraguay)`,
  `El equipo humano está ${enHorario ? 'DENTRO' : 'FUERA'} del horario de atención (${cfg.atencionDesde} a ${cfg.atencionHasta}).`,
  '',
  '=== DATOS YA CONOCIDOS DE ESTA PERSONA ===',
  `Nombre en WhatsApp: ${u.name || 'no informado'}`,
  `Etapa actual: ${e.stage || 'NUEVO'}`,
  `Mensajes del cliente hasta ahora: ${e.inCount || 1}`,
  `Datos del interesado: ${JSON.stringify(e.lead ?? {})}`,
  e.ubicacion ? 'Ya compartió su ubicación GPS.' : '',
  (e.adjuntos ?? []).length ? `Ya envió ${(e.adjuntos ?? []).length} adjunto(s) (imágenes/documentos).` : '',
  '',
  '=== BLOQUES YA ENVIADOS EN LAS ÚLTIMAS 6 HORAS (no los repitas salvo que los pida de nuevo) ===',
  sent.length ? sent.join(', ') : 'ninguno',
  '',
  '=== BLOQUES AUTORIZADOS (código: contenido) ===',
  ...Object.entries(ficha.catalogo).map(([k, v]) => `${k}: ${v}`),
  '',
  '=== TEMAS SIN TARIFA CARGADA (derivar a una persona, no inventar) ===',
  ...ficha.sinTarifa.map((t) => `- ${t}`),
];

return [{ json: { phone: u.phone, name: u.name, aiInput: lines.filter((l) => l !== undefined).join('\n'), enHorario } }];
