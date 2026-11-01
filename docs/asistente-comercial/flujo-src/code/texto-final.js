// Unifica el texto del mensaje (texto, audio transcripto, adjunto, ubicación) y arma el buffer anti-ráfaga.
const base = $('Estado del chat').first().json;
const inp = $input.first().json;
const e = base.e;
const cap = base.text ? ' con el texto: "' + base.text + '"' : '';
let text;

switch (base.kind) {
  case 'audio':
    if (inp.audioLargo) text = '[AUDIO MUY LARGO, no se transcribió: pedile amablemente que lo resuma por escrito]';
    else if (typeof inp.text === 'string' && inp.text.trim()) text = '[Audio transcripto] ' + inp.text.trim();
    else text = '[AUDIO NO COMPRENDIDO, falló la transcripción: pedile que lo escriba]';
    break;
  case 'image': text = '[El cliente envió una imagen' + cap + ']'; break;
  case 'video': text = '[El cliente envió un video' + cap + ']'; break;
  case 'document': text = '[El cliente envió un documento' + (base.fileName ? ' llamado "' + base.fileName + '"' : '') + cap + ']'; break;
  case 'location': text = '[El cliente compartió su ubicación GPS]'; break;
  case 'contact': text = '[El cliente compartió un contacto]'; break;
  case 'sticker': text = '[El cliente envió un sticker]'; break;
  default: text = base.text;
}

// Adjuntos y ubicación quedan anotados para el equipo humano.
if (['image', 'document', 'video', 'location', 'contact'].includes(base.kind)) {
  e.adjuntos = [...(e.adjuntos ?? []), { tipo: base.kind, at: Date.now(), archivo: base.fileName ?? null }].slice(-20);
}
if (base.location) e.ubicacion = base.location;

const prev = String($('Leer estado (entrante)').first().json.buffer ?? '').trim();
const buffer = prev ? prev + '\n' + text : text;

return [{
  json: { ...base, text, e, estado: JSON.stringify(e), buffer, lastMsgId: base.messageId },
}];
