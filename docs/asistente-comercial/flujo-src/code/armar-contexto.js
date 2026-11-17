// Arma el mensaje que recibe el modelo: texto del cliente + lo que ya sabemos + bloques autorizados.
const cfg = $('Config').first().json;
const ficha = $('Ficha de servicios').first().json;
const u = $('¿Último mensaje?').first().json;
const e = u.e ?? {};

// Etapa del lead en el tablero del CRM (si crmEtapasActivo y el CRM respondió).
let tablero = null;
try { const t = $('CRM: etapa del lead').first().json; if (t && t.found) tablero = t; } catch { tablero = null; }

const now = $now.setZone(cfg.zonaHoraria || 'America/Asuncion');
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
  tablero ? `Etapa en el tablero del equipo (CRM): ${tablero.stage}${tablero.changedByPerson ? ` (la puso ${tablero.changedBy || 'una persona del equipo'}: respetala y no la contradigas)` : ''}` : '',
  tablero?.isWon ? 'El equipo ya lo marcó como cliente ganado: no le vuelvas a vender la constitución; ayudalo y, si pide algo del trámite, derivá.' : '',
  tablero?.isLost ? 'El equipo lo marcó como no concretado: respondé con amabilidad lo que pregunte, sin insistir con la venta.' : '',
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
  ...(ficha.instruccionesExtra ? ['', '=== INSTRUCCIONES ADICIONALES DEL ESTUDIO ===', ficha.instruccionesExtra] : []),
];

return [{ json: { phone: u.phone, name: u.name, aiInput: lines.filter((l) => l !== undefined).join('\n'), enHorario } }];
