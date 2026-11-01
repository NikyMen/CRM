// Normaliza el webhook de wppia (messages.upsert) o el disparo horario de seguimientos.
const cfg = $('Config').first().json;
const item = $input.first().json;
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const last9 = (v) => digits(v).slice(-9);
const lista = (v) => String(v ?? '').split(/[,;\s]+/).map(last9).filter(Boolean);
const skip = (reason) => [{ json: { route: 'skip', reason } }];

// Disparo del Schedule Trigger: no trae body.
if (item.body === undefined) return [{ json: { route: 'scan' } }];

// Sin secreto configurado el webhook quedaría abierto a cualquiera: se descarta todo.
const secret = String(cfg.webhookSecret ?? '').trim();
if (!secret || secret === 'CAMBIAR') return skip('configurar_webhookSecret');
if (String(item.headers?.['x-webhook-secret'] ?? '') !== secret) return skip('secreto_invalido');

const body = item.body ?? {};
if (!['messages.upsert', 'messages.received'].includes(body.event)) return skip('evento_' + body.event);

const raw = Array.isArray(body.data?.messages) ? body.data.messages[0] : body.data?.messages;
if (!raw?.key) return skip('sin_mensaje');

const key = raw.key;
const jid = String(key.remoteJid ?? raw.remoteJid ?? '');
if (jid.endsWith('@g.us') || jid.includes('broadcast') || raw.broadcast === true) return skip('grupo_o_difusion');

const fromMe = key.fromMe === true;
// Con LID el remoteJid no es el teléfono: se usa el número real que informa wppia.
const phone = fromMe
  ? digits(jid.endsWith('@s.whatsapp.net') ? jid : key.senderPn || key.cleanedSenderPn || '')
  : digits(key.cleanedSenderPn || key.senderPn || (jid.endsWith('@s.whatsapp.net') ? jid : ''));
if (!phone) return skip('sin_telefono');

// Números que el bot nunca atiende.
const interno = last9(cfg.notificarA);
if (interno && last9(phone) === interno) return skip('numero_interno');
if (lista(cfg.excluir).includes(last9(phone))) return skip('excluido');
const prueba = lista(cfg.soloPrueba);
if (prueba.length && !prueba.includes(last9(phone))) return skip('fuera_de_la_lista_de_prueba');

// Desenvuelve mensajes efímeros / de una sola vista / documento con caption.
let m = raw.message ?? {};
for (let i = 0; i < 3; i++) {
  m = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message
    ?? m.documentWithCaptionMessage?.message ?? m;
}

let kind;
let text = String(raw.messageBody ?? m.conversation ?? m.extendedTextMessage?.text ?? '').trim();
let seconds = 0;
let fileName = null;
let location = null;

if (m.reactionMessage || m.protocolMessage || m.senderKeyDistributionMessage) return skip('mensaje_de_sistema');
else if (m.audioMessage) { kind = 'audio'; seconds = Number(m.audioMessage.seconds) || 0; }
else if (m.imageMessage) { kind = 'image'; text = text || String(m.imageMessage.caption ?? ''); }
else if (m.videoMessage) { kind = 'video'; text = text || String(m.videoMessage.caption ?? ''); }
else if (m.documentMessage) {
  kind = 'document';
  fileName = m.documentMessage.fileName || m.documentMessage.title || null;
  text = text || String(m.documentMessage.caption ?? '');
}
else if (m.locationMessage) {
  kind = 'location';
  location = { lat: m.locationMessage.degreesLatitude, lng: m.locationMessage.degreesLongitude };
}
else if (m.contactMessage || m.contactsArrayMessage) kind = 'contact';
else if (m.stickerMessage) kind = 'sticker';
else if (text) kind = 'text';
else return skip('vacio');

return [{
  json: {
    route: fromMe ? 'fromMe' : 'inbound',
    phone,
    name: String(raw.pushName ?? '').trim(),
    messageId: String(key.id ?? raw.id ?? ''),
    kind,
    text,
    seconds,
    fileName,
    location,
    tsMs: Number(raw.messageTimestamp) ? Number(raw.messageTimestamp) * 1000 : Date.now(),
    // Lo que pide POST /api/decrypt-media de wppia para bajar el audio.
    rawForMedia: { key: { id: key.id }, message: raw.message },
  },
}];
