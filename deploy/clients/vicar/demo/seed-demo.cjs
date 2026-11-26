// Datos de ejemplo de Vicar Inmobiliaria SOLO para la instancia local de demostración.
// Crea vendedores con credenciales, chats de WhatsApp con fotos de propiedades, conversaciones
// de Instagram y de Facebook, sus leads en el tablero y publicaciones de Instagram en borrador.
// Con --completo agrega además tickets de postventa, propietarios, tareas y chat interno
// (secciones que la instalación "pelada" de Vicar tiene apagadas).
// Todo es ficticio (nombres, teléfonos 54937940000xx, propiedades e imágenes ilustradas).
//
//   node deploy/clients/vicar/demo/seed-demo.cjs            # carga (borra antes la demo anterior)
//   node deploy/clients/vicar/demo/seed-demo.cjs --completo # también tickets, propietarios, tareas y chat interno
//   node deploy/clients/vicar/demo/seed-demo.cjs --borrar   # sólo borra la demo
//   node deploy/clients/vicar/demo/seed-demo.cjs --clave=<clave>  # además pone esa clave al dueño y a los 4 usuarios
//     (sólo para una demo: cierra las sesiones abiertas de esas cuentas)
//
// Lee backend/.env. Las contraseñas de los usuarios nuevos se escriben en
// backend/.data/usuarios-vicar.txt (git lo ignora) y no se imprimen.
// Nunca correr contra una base de producción.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '../../../..')
const BACKEND = path.join(ROOT, 'backend')
// El cliente generado (node_modules/.prisma en la raíz) busca @prisma/client/runtime, que pnpm
// sólo deja en backend/node_modules: se agrega como ruta de búsqueda de respaldo.
process.env.NODE_PATH = [path.join(BACKEND, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
require('node:module').Module._initPaths()
const fromBackend = (mod) => require(require.resolve(mod, { paths: [BACKEND] }))
fromBackend('dotenv').config({ path: path.join(BACKEND, '.env'), quiet: true })
const { PrismaClient } = fromBackend('@prisma/client')
const bcrypt = fromBackend('bcryptjs')

const SLUG = 'vicar'
const DEMO_TAG = 'demo'
const PHOTOS = path.join(__dirname, 'fotos')
const CREDENTIALS_FILE = path.join(BACKEND, '.data', 'usuarios-vicar.txt')
const MEDIA_BASE = path.resolve(BACKEND, process.env.WHATSAPP_MEDIA_DIR || '.data/whatsapp-media')
const TICKETS_MEDIA = MEDIA_BASE
const COMMERCIAL_MEDIA = path.join(path.dirname(MEDIA_BASE), 'whatsapp-commercial-media')

const db = new PrismaClient()
const now = Date.now()
const ago = (hours, minutes = 0) => new Date(now - hours * 3_600_000 - minutes * 60_000)
const phone = (n) => `54937940000${String(n).padStart(2, '0')}`
const jidOf = (n) => `${phone(n)}@s.whatsapp.net`
const isDemoJid = (jid) => /^54937940000\d\d@s\.whatsapp\.net$/.test(jid)

// ─── Equipo ─────────────────────────────────────────────────────────
const TEAM = [
  { key: 'santi', firstName: 'Santiago', lastName: 'Coordinador', email: 'santi@vicar.test', role: 'admin' },
  { key: 'maxi', firstName: 'Maximiliano', lastName: 'Vendedor', email: 'maxi@vicar.test', role: 'member' },
  { key: 'seba', firstName: 'Sebastián', lastName: 'Vendedor', email: 'seba@vicar.test', role: 'member' },
  { key: 'eve', firstName: 'Evelyn', lastName: 'Contenidos', email: 'eve@vicar.test', role: 'member' },
]

// ─── Propiedades (fotos en ./fotos) ─────────────────────────────────
const PROPS = {
  santaAna: { foto: 'casa-santa-ana.jpg', titulo: 'Casa 3 dormitorios en Santa Ana', precio: 'USD 95.000', valor: 95000, moneda: 'USD', captador: 'maxi' },
  depto: { foto: 'depto-centro.jpg', titulo: 'Departamento 2 ambientes en el Centro', precio: '$ 450.000 por mes', valor: 450000, moneda: 'ARS', captador: 'seba' },
  quinta: { foto: 'quinta-pileta.jpg', titulo: 'Quinta con pileta sobre Ruta 12', precio: 'USD 140.000', valor: 140000, moneda: 'USD', captador: 'seba' },
  terreno: { foto: 'terreno-barrio.jpg', titulo: 'Terreno 12x30 en Barrio Aeroclub', precio: 'USD 28.000', valor: 28000, moneda: 'USD', captador: null },
  local: { foto: 'local-comercial.jpg', titulo: 'Local comercial 80 m² en Av. 3 de Abril', precio: '$ 800.000 por mes', valor: 800000, moneda: 'ARS', captador: 'maxi' },
  familiar: { foto: 'casa-familiar.jpg', titulo: 'Casa 4 dormitorios con quincho en Laguna Seca', precio: 'USD 120.000', valor: 120000, moneda: 'USD', captador: 'seba' },
}

// ─── Chats del WhatsApp comercial → leads del embudo ────────────────
// m: [horasAtrás, quién ('c' cliente | clave del vendedor), texto, foto?]
const LEADS = [
  {
    n: 1, name: 'Lucía Fernández', prop: 'santaAna', owner: 'maxi', stage: 'Visita coordinada', unread: 0,
    m: [
      [30, 'c', 'Hola! Vi en Instagram la casa de Santa Ana, sigue disponible?'],
      [29.8, 'maxi', '¡Hola Lucía! Sí, sigue disponible. Te paso la ficha 👇'],
      [29.7, 'maxi', 'Casa 3 dormitorios, 2 baños, cochera y patio. USD 95.000.', 'santaAna'],
      [28, 'c', 'Me encanta. Se puede ver este sábado?'],
      [27.5, 'maxi', 'Dale, te agendo el sábado a las 10. Te mando la ubicación ese día.'],
      [27, 'c', 'Perfecto, gracias!'],
    ],
  },
  {
    n: 2, name: 'Martín Gómez', prop: 'depto', owner: 'seba', stage: 'Calificación', unread: 1,
    m: [
      [20, 'c', 'Buenas, consulto por el depto del centro en alquiler'],
      [19.5, 'seba', 'Hola Martín, ¿cómo estás? Es un 2 ambientes, $450.000 por mes más expensas.', 'depto'],
      [19, 'seba', '¿Para cuántas personas sería y con qué garantía contás?'],
      [2, 'c', 'Somos dos. Tengo recibo de sueldo y garantía propietaria de mi viejo'],
    ],
  },
  {
    n: 3, name: 'Carolina Ruiz', prop: 'quinta', owner: 'seba', stage: 'Propuesta / reserva', unread: 0,
    m: [
      [70, 'c', 'Hola, vi esta publicación. Me pasás más info?', 'quinta'],
      [69, 'seba', 'Hola Carolina! Es la quinta sobre Ruta 12: 1 hectárea, casa de 2 dormitorios, pileta y quincho. USD 140.000.'],
      [50, 'c', 'La fuimos a ver con mi marido y nos gustó mucho. Aceptan USD 130.000?'],
      [49, 'seba', 'Le paso la oferta al propietario y te confirmo hoy.'],
      [26, 'seba', 'El propietario acepta USD 135.000 con una reserva del 10%. ¿Avanzamos?'],
      [25, 'c', 'Sí, avanzamos. Mañana paso por la oficina.'],
    ],
  },
  {
    n: 4, name: 'Diego Acosta', prop: 'terreno', owner: null, stage: 'Consulta recibida', unread: 2,
    m: [
      [1.2, 'c', 'Hola, el terreno del barrio Aeroclub tiene escritura?'],
      [1.1, 'c', 'Y aceptan financiación?'],
    ],
  },
  {
    n: 5, name: 'Valeria Sosa', prop: 'local', owner: 'maxi', stage: 'Negociación', unread: 0,
    m: [
      [48, 'c', 'Buenas tardes, estoy buscando un local para una panadería'],
      [47.5, 'maxi', 'Hola Valeria! Tenemos este sobre Av. 3 de Abril, 80 m², con baño y depósito.', 'local'],
      [30, 'c', 'Lo vi. Se puede hacer contrato por 3 años con el primer año a $700.000?'],
      [29, 'maxi', 'Lo consulto con el dueño. Él pide $800.000, pero creo que podemos acercarnos.'],
      [5, 'maxi', 'Valeria, el dueño acepta $750.000 el primer año. ¿Te sirve?'],
    ],
  },
  {
    n: 6, name: 'Jorge Benítez', prop: 'familiar', owner: 'seba', stage: 'Operación cerrada', unread: 0,
    m: [
      [140, 'c', 'Hola, consulto por la casa de Laguna Seca con quincho'],
      [139, 'seba', 'Hola Jorge! Te mando fotos y la ficha.', 'familiar'],
      [100, 'c', 'Hacemos la oferta por el precio publicado.'],
      [30, 'seba', '¡Felicitaciones Jorge! Quedó firmado el boleto. Cualquier cosa estoy a disposición 🏡'],
      [29, 'c', 'Gracias Seba, excelente atención!'],
    ],
  },
  {
    n: 7, name: 'Paula Medina', prop: null, owner: null, stage: 'Consulta recibida', unread: 1,
    m: [
      [0.4, 'c', 'Hola! Qué casas tienen en alquiler para familia con 2 nenes? Hasta $600.000'],
    ],
  },
  {
    n: 8, name: 'Ramiro Ortiz', prop: 'santaAna', owner: 'maxi', stage: 'No concretado', unread: 0,
    m: [
      [200, 'c', 'Precio de la casa de Santa Ana?'],
      [199, 'maxi', 'Hola Ramiro! USD 95.000. Te paso la foto.', 'santaAna'],
      [150, 'c', 'Se me va de presupuesto, gracias igual'],
      [149, 'maxi', 'Gracias a vos. Si cambia algo te aviso 👍'],
    ],
  },
]

// ─── Instagram y Facebook → leads del tablero ───────────────────────
// Las cuentas quedan "sin conectar": son conversaciones de muestra, no hay token de Meta.
const SOCIAL = [
  {
    n: 41, network: 'instagram', name: 'Camila Ojeda', username: 'cami.ojeda', prop: 'quinta', owner: 'seba', stage: 'Calificación', unread: 1,
    m: [
      [9, 'c', 'Hola! Vi la quinta con pileta en su perfil 😍 sigue en venta?'],
      [8.5, 'seba', '¡Hola Camila! Sí, sigue disponible. USD 140.000, 1 hectárea sobre Ruta 12.'],
      [1.5, 'c', 'Genial. Se puede financiar una parte?'],
    ],
  },
  {
    n: 42, network: 'instagram', name: 'Nicolás Vera', username: 'nico_vera', prop: 'depto', owner: null, stage: 'Consulta recibida', unread: 2,
    m: [
      [0.7, 'c', 'Buenas, precio del depto del centro?'],
      [0.6, 'c', 'Acepta mascotas?'],
    ],
  },
  {
    n: 43, network: 'instagram', name: 'Florencia Ayala', username: 'flor.ayala', prop: 'santaAna', owner: 'maxi', stage: 'Visita coordinada', unread: 0,
    m: [
      [52, 'c', 'Hola, me interesa la casa de Santa Ana que subieron ayer'],
      [51, 'maxi', '¡Hola Florencia! 3 dormitorios, 2 baños y cochera. USD 95.000. ¿Querés verla?'],
      [50, 'c', 'Sí, el viernes a la tarde puedo'],
      [49, 'maxi', 'Listo, viernes 17 h. Te escribo ese día para confirmar 👍'],
    ],
  },
  {
    n: 44, network: 'instagram', name: 'Tomás Riquelme', username: 'tomi.riquelme', prop: 'terreno', owner: 'maxi', stage: 'No concretado', unread: 0,
    m: [
      [120, 'c', 'Cuánto sale el terreno del Aeroclub?'],
      [119, 'maxi', 'Hola Tomás, USD 28.000. Tiene escritura y todos los servicios.'],
      [96, 'c', 'Gracias, por ahora no'],
    ],
  },
  {
    n: 51, network: 'facebook', name: 'Marta Giménez', username: null, prop: 'familiar', owner: 'seba', stage: 'Propuesta / reserva', unread: 0,
    m: [
      [80, 'c', 'Buenas tardes, quisiera información de la casa con quincho de Laguna Seca'],
      [79, 'seba', 'Buenas tardes Marta. 4 dormitorios, quincho y pileta. USD 120.000.'],
      [40, 'c', 'La vimos el sábado. Queremos señarla, cómo seguimos?'],
      [39, 'seba', 'Excelente. Le preparo la reserva y se la paso mañana para firmar.'],
    ],
  },
  {
    n: 52, network: 'facebook', name: 'Oscar Ledesma', username: null, prop: 'local', owner: null, stage: 'Consulta recibida', unread: 1,
    m: [
      [3, 'c', 'Hola, el local de 3 de Abril sigue disponible? Es para un kiosco'],
    ],
  },
  {
    n: 53, network: 'facebook', name: 'Rosa Benítez', username: null, prop: 'depto', owner: 'maxi', stage: 'Negociación', unread: 0,
    m: [
      [60, 'c', 'Hola, pregunto por el alquiler del departamento del centro para mi hija que estudia'],
      [59, 'maxi', 'Hola Rosa. $450.000 por mes más expensas. Piden garantía propietaria o seguro de caución.'],
      [20, 'c', 'Podemos hacer contrato por 2 años con el primer mes bonificado?'],
      [19, 'maxi', 'Lo hablo con el dueño y le aviso hoy mismo.'],
    ],
  },
]

const POSTS = [
  { foto: 'casa-santa-ana.jpg', by: 'eve', caption: '🏡 CASA EN VENTA · Santa Ana\n\n3 dormitorios · 2 baños · cochera · patio con parrilla\nUSD 95.000\n\n📲 Consultas por mensaje directo\n\n#vicarinmobiliaria #casaenventa #corrientes #santaana' },
  { foto: 'local-comercial.jpg', by: 'eve', caption: '🏬 LOCAL EN ALQUILER · Av. 3 de Abril\n\n80 m² con baño y depósito, ideal comercio.\n$ 800.000 por mes\n\n📲 Escribinos para coordinar una visita\n\n#vicarinmobiliaria #localcomercial #alquiler #corrientes' },
]

// ─── WhatsApp de Tickets: postventa de inquilinos y propietarios ────
const TICKETS = [
  {
    n: 21, name: 'Gabriela Torres', subject: 'Pérdida de agua en el baño', status: 'OPEN', priority: 'HIGH', assignee: 'seba',
    m: [[6, 'c', 'Hola, soy la inquilina del depto de calle Junín. Hay una pérdida de agua debajo del lavatorio'], [5.5, 'seba', 'Hola Gabriela, ya le aviso al propietario y te mandamos un plomero mañana a la mañana.']],
  },
  {
    n: 22, name: 'Hernán Castro', subject: 'Renovación de contrato', status: 'NEW', priority: 'NORMAL', assignee: null,
    m: [[0.8, 'c', 'Buen día, el mes que viene se me vence el contrato. Quiero renovar, cómo seguimos?']],
  },
  {
    n: 23, name: 'Silvia Romero', subject: 'Entrega de llaves', status: 'RESOLVED', priority: 'NORMAL', assignee: 'maxi',
    m: [[50, 'c', 'A qué hora paso a buscar las llaves?'], [49, 'maxi', 'Mañana a las 9 en la oficina, Silvia.'], [24, 'c', 'Listo, ya las tengo. Gracias!']],
  },
]

// ─── Propietarios (Clientes) ────────────────────────────────────────
const OWNERS = [
  { name: 'Familia Romero', prop: 'santaAna', owner: 'maxi', phone: 31 },
  { name: 'Carlos Duarte', prop: 'quinta', owner: 'seba', phone: 32 },
  { name: 'Inmobiliaria del Sur SRL (local)', prop: 'local', owner: 'maxi', phone: 33, legal: true },
  { name: 'Ana Villalba', prop: 'familiar', owner: 'seba', phone: 34 },
]

const TASKS = [
  { title: 'Visita casa Santa Ana con Lucía Fernández (sábado 10 h)', assignee: 'maxi', priority: 'HIGH', inDays: 2 },
  { title: 'Preparar reserva de la quinta (Carolina Ruiz)', assignee: 'seba', priority: 'HIGH', inDays: 1 },
  { title: 'Armar placas de las 3 propiedades nuevas para Instagram', assignee: 'eve', priority: 'MEDIUM', inDays: 3 },
  { title: 'Definir criterios de reparto de consultas con el equipo', assignee: 'santi', priority: 'MEDIUM', inDays: 5 },
  { title: 'Mandar plomero al depto de calle Junín', assignee: 'seba', priority: 'HIGH', inDays: 0, status: 'IN_PROGRESS' },
]

const TEAM_CHAT = [
  [26, 'santi', 'Buen día equipo. Desde hoy las consultas de la cuenta unificada entran todas acá 🙌'],
  [25.8, 'maxi', 'Genial. La de Santa Ana ya tiene visita el sábado.'],
  [25.5, 'eve', 'Subo hoy a las 20:30 la placa del local de 3 de Abril. ¿Alguien tiene más fotos del interior?'],
  [25, 'maxi', 'Te las paso a la tarde, Eve.'],
  [24, 'seba', 'La quinta de Ruta 12 está para reservar 💪 Mañana viene Carolina a la oficina.'],
  [3, 'santi', 'Quedaron 2 consultas sin responsable (terreno Aeroclub y alquiler familiar). ¿Quién las toma?'],
]

async function wipe(workspaceId) {
  const counts = {}
  const commercialChats = (await db.collectionWhatsAppChat.findMany({ where: { workspaceId }, select: { id: true, jid: true } })).filter((c) => isDemoJid(c.jid))
  const chatIds = commercialChats.map((c) => c.id)
  counts.leads = (await db.deal.deleteMany({ where: { workspaceId, OR: [{ customData: { path: ['demo'], equals: true } }, ...chatIds.map((id) => ({ customData: { path: ['commercialChatId'], equals: id } }))] } })).count
  counts.chatsComerciales = (await db.collectionWhatsAppChat.deleteMany({ where: { id: { in: chatIds } } })).count
  const ticketChats = (await db.whatsAppChat.findMany({ where: { workspaceId }, select: { id: true, jid: true } })).filter((c) => isDemoJid(c.jid))
  const ticketChatIds = ticketChats.map((c) => c.id)
  counts.tickets = (await db.ticket.deleteMany({ where: { workspaceId, whatsappChatId: { in: ticketChatIds } } })).count
  counts.chatsTickets = (await db.whatsAppChat.deleteMany({ where: { id: { in: ticketChatIds } } })).count
  const demoConnections = await db.channelConnection.findMany({ where: { workspaceId, externalAccountId: { startsWith: 'demo-' } }, select: { id: true } })
  const demoConversations = await db.conversation.findMany({ where: { workspaceId, connectionId: { in: demoConnections.map((c) => c.id) } }, select: { id: true } })
  counts.leadsRedes = (await db.deal.deleteMany({ where: { workspaceId, OR: [{ id: '-' }, ...demoConversations.map((c) => ({ customData: { path: ['socialConversationId'], equals: c.id } }))] } })).count
  counts.conversacionesRedes = (await db.channelConnection.deleteMany({ where: { id: { in: demoConnections.map((c) => c.id) } } })).count ? demoConversations.length : 0
  counts.publicaciones = (await db.socialPost.deleteMany({ where: { workspaceId, imageFileName: { startsWith: 'demo-' } } })).count
  counts.contactos = (await db.contact.deleteMany({ where: { workspaceId, tags: { has: DEMO_TAG } } })).count
  counts.tareas = (await db.task.deleteMany({ where: { workspaceId, description: { startsWith: '[demo]' } } })).count
  counts.propietarios = (await db.company.deleteMany({ where: { workspaceId, tags: { has: DEMO_TAG } } })).count
  const general = await db.internalConversation.findUnique({ where: { workspaceId_key: { workspaceId, key: 'general' } } })
  if (general) counts.mensajesInternos = (await db.internalChatMessage.deleteMany({ where: { conversationId: general.id, body: { endsWith: '​' } } })).count
  fs.rmSync(path.join(COMMERCIAL_MEDIA, workspaceId, 'demo'), { recursive: true, force: true })
  fs.rmSync(path.join(TICKETS_MEDIA, workspaceId, 'demo'), { recursive: true, force: true })
  return counts
}

function copyPhoto(root, workspaceId, recordId, file) {
  const relative = path.join(workspaceId, 'demo', `${recordId}.jpg`)
  const absolute = path.join(root, relative)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.copyFileSync(path.join(PHOTOS, file), absolute)
  return { mediaPath: relative, mediaMimeType: 'image/jpeg', mediaFileName: file, mediaSizeBytes: fs.statSync(absolute).size }
}

async function ensureTeam(workspaceId) {
  const users = {}
  const created = []
  for (const member of TEAM) {
    let user = await db.user.findUnique({ where: { email: member.email } })
    if (!user) {
      const password = crypto.randomBytes(12).toString('base64url')
      user = await db.user.create({ data: { email: member.email, firstName: member.firstName, lastName: member.lastName, passwordHash: await bcrypt.hash(password, 12) } })
      created.push({ ...member, password })
    }
    await db.workspaceUser.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      update: { role: member.role },
      create: { workspaceId, userId: user.id, role: member.role },
    })
    users[member.key] = user
  }
  if (created.length) {
    fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true })
    const previous = fs.existsSync(CREDENTIALS_FILE) ? fs.readFileSync(CREDENTIALS_FILE, 'utf8') : '# Usuarios de ejemplo de Vicar (local). No versionar.\n'
    fs.writeFileSync(CREDENTIALS_FILE, previous + created.map((m) => `${m.email}\t${m.password}\t${m.role}\t${m.firstName}`).join('\n') + '\n')
  }
  return { users, created: created.length }
}

async function newLeadNumber(workspaceId) {
  for (;;) {
    const candidate = String(crypto.randomInt(10_000_000, 100_000_000))
    if (!(await db.deal.findFirst({ where: { workspaceId, leadNumber: candidate }, select: { id: true } }))) return candidate
  }
}

async function main() {
  const workspace = await db.workspace.findUnique({ where: { slug: SLUG } })
  if (!workspace) throw new Error(`No existe el workspace "${SLUG}". Corré antes el bootstrap.`)
  const workspaceId = workspace.id
  const wiped = await wipe(workspaceId)
  console.log('demo anterior borrada:', Object.entries(wiped).map(([k, v]) => `${k}=${v}`).join(' '))
  if (process.argv.includes('--borrar')) return
  const sharedPassword = process.argv.find((arg) => arg.startsWith('--clave='))?.slice('--clave='.length)
  if (sharedPassword !== undefined && sharedPassword.length < 6) throw new Error('--clave necesita al menos 6 caracteres')

  const owner = await db.workspaceUser.findFirst({ where: { workspaceId, role: 'owner' }, include: { user: true } })
  const { users, created } = await ensureTeam(workspaceId)
  const who = (key) => (key === 'c' ? null : users[key])
  console.log(`equipo: ${TEAM.length} personas (${created} nuevas; contraseñas en backend/.data/usuarios-vicar.txt)`)
  if (sharedPassword) {
    const ids = [...Object.values(users).map((u) => u.id), ...(owner ? [owner.userId] : [])]
    const passwordHash = await bcrypt.hash(sharedPassword, 12)
    await db.user.updateMany({ where: { id: { in: ids } }, data: { passwordHash, sessionVersion: { increment: 1 } } })
    console.log(`clave compartida de demo aplicada a ${ids.length} cuentas (dueño y equipo)`)
  }

  const full = process.argv.includes('--completo')

  // Propietarios
  const owners = {}
  for (const o of full ? OWNERS : []) {
    const prop = PROPS[o.prop]
    const company = await db.company.create({
      data: {
        workspaceId, name: o.name, personType: o.legal ? 'LEGAL_ENTITY' : 'INDIVIDUAL', country: 'Argentina', city: 'Corrientes',
        status: 'ACTIVE', ownerId: users[o.owner].id, phone: `+${phone(o.phone)}`, tags: [DEMO_TAG, 'propietario'],
        activity: `Propietario: ${prop.titulo}`, customData: { propiedad: prop.titulo, precio: prop.precio },
      },
    })
    await db.clientAssignment.create({ data: { workspaceId, companyId: company.id, userId: users[o.owner].id } })
    owners[o.prop] = company
  }

  // WhatsApp comercial + leads
  const pipeline = await db.pipeline.findFirst({ where: { workspaceId, isDefault: true }, include: { stages: true } })
  if (!pipeline) throw new Error('No hay embudo predeterminado: corré post-bootstrap.cjs')
  const stageByName = new Map(pipeline.stages.map((s) => [s.name, s]))
  await db.collectionWhatsAppSession.upsert({ where: { workspaceId_line: { workspaceId, line: 'commercial' } }, create: { workspaceId, line: 'commercial' }, update: {} })
  const positions = {}
  for (const lead of LEADS) {
    const last = lead.m[lead.m.length - 1]
    const chat = await db.collectionWhatsAppChat.create({
      data: {
        workspaceId, line: 'commercial', jid: jidOf(lead.n), phoneNumber: phone(lead.n), displayName: lead.name,
        unreadCount: lead.unread, lastMessageAt: ago(last[0]), lastMessagePreview: last[3] && !last[2] ? '📷 Foto' : last[2], lastMessageFromMe: last[1] !== 'c',
        // Responsable del chat (bandeja de Mensajes): el mismo vendedor que el lead.
        assignedToUserId: lead.owner ? users[lead.owner].id : null, assignedAt: lead.owner ? ago(lead.m[0][0]) : null,
      },
    })
    for (const [i, [hours, from, text, photo]] of lead.m.entries()) {
      const msg = await db.collectionWhatsAppMessage.create({
        data: {
          workspaceId, chatId: chat.id, messageId: `DEMO${lead.n}X${i}`, fromMe: from !== 'c', pushName: from === 'c' ? lead.name : null,
          messageType: photo ? 'image' : 'text', text, status: from === 'c' ? null : 'read', sentByUserId: who(from)?.id ?? null, sentAt: ago(hours),
        },
      })
      if (photo) await db.collectionWhatsAppMessage.update({ where: { id: msg.id }, data: copyPhoto(COMMERCIAL_MEDIA, workspaceId, msg.id, PROPS[photo].foto) })
    }
    const contact = await db.contact.create({
      data: {
        workspaceId, firstName: lead.name.split(' ')[0], lastName: lead.name.split(' ').slice(1).join(' '), phone: phone(lead.n), status: 'LEAD', source: 'WHATSAPP',
        tags: [DEMO_TAG, 'whatsapp', 'comercial'], ownerId: lead.owner ? users[lead.owner].id : null, lastContactedAt: ago(last[0]),
        channels: [{ type: 'whatsapp', identifier: phone(lead.n), metadata: { jid: chat.jid, line: 'commercial' } }],
      },
    })
    const stage = stageByName.get(lead.stage)
    if (!stage) throw new Error(`No existe la etapa "${lead.stage}"`)
    const prop = lead.prop ? PROPS[lead.prop] : null
    positions[stage.id] = (positions[stage.id] ?? -1) + 1
    const leadNumber = await newLeadNumber(workspaceId)
    await db.deal.create({
      data: {
        workspaceId, leadNumber, title: prop ? `${lead.name} · ${prop.titulo}` : `${lead.name} · Busca alquiler`, value: prop ? String(prop.valor) : null, currency: prop?.moneda ?? 'ARS',
        probability: stage.probability, pipelineId: pipeline.id, stageId: stage.id, position: positions[stage.id], ownerId: lead.owner ? users[lead.owner].id : null,
        companyId: lead.prop && owners[lead.prop] ? owners[lead.prop].id : null,
        status: stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN', closedAt: stage.isWon || stage.isLost ? ago(last[0]) : null,
        closedReason: stage.isLost ? 'Fuera de presupuesto' : null, stageEnteredAt: ago(last[0]), createdAt: ago(lead.m[0][0]),
        customData: { demo: true, leadNumber, sourceChannel: 'commercial-whatsapp', commercialChatId: chat.id, propiedad: prop?.titulo ?? null, captador: prop?.captador ?? null },
        contacts: { create: [{ contactId: contact.id }] },
      },
    })
  }
  console.log(`WhatsApp comercial: ${LEADS.length} chats con fotos y ${LEADS.length} leads en "${pipeline.name}"`)

  // Instagram y Facebook
  const connections = {}
  for (const [network, channel, name] of [['instagram', 'instagram', 'Instagram (muestra)'], ['facebook', 'messenger', 'Facebook (muestra)']]) {
    connections[network] = await db.channelConnection.create({ data: { workspaceId, provider: 'meta', channel, name, status: 'disconnected', externalAccountId: `demo-${network}` } })
  }
  for (const item of SOCIAL) {
    const channel = item.network === 'instagram' ? 'instagram' : 'messenger'
    const last = item.m[item.m.length - 1]
    const contact = await db.contact.create({
      data: {
        workspaceId, firstName: item.name.split(' ')[0], lastName: item.name.split(' ').slice(1).join(' '), status: 'LEAD', source: channel.toUpperCase(),
        tags: [DEMO_TAG, item.network], ownerId: item.owner ? users[item.owner].id : null, lastContactedAt: ago(last[0]),
      },
    })
    await db.contactIdentity.create({ data: { workspaceId, contactId: contact.id, provider: 'meta', channel, externalUserId: `demo-${item.n}`, externalUsername: item.username, externalDisplayName: item.name } })
    const lastInbound = [...item.m].reverse().find((m) => m[1] === 'c')
    const lastOutbound = [...item.m].reverse().find((m) => m[1] !== 'c')
    const conversation = await db.conversation.create({
      data: {
        workspaceId, connectionId: connections[item.network].id, contactId: contact.id, provider: 'meta', channel, externalUserId: `demo-${item.n}`,
        unreadCount: item.unread, lastMessageAt: ago(last[0]), lastInboundAt: lastInbound ? ago(lastInbound[0]) : null, lastOutboundAt: lastOutbound ? ago(lastOutbound[0]) : null,
        assignedToUserId: item.owner ? users[item.owner].id : null,
      },
    })
    for (const [hours, from, text] of item.m) {
      await db.message.create({
        data: {
          workspaceId, conversationId: conversation.id, contactId: contact.id, provider: 'meta', channel, direction: from === 'c' ? 'inbound' : 'outbound',
          type: 'text', status: from === 'c' ? 'received' : 'sent', text, sentAt: ago(hours), createdAt: ago(hours),
        },
      })
    }
    const stage = stageByName.get(item.stage)
    if (!stage) throw new Error(`No existe la etapa "${item.stage}"`)
    const prop = PROPS[item.prop]
    positions[stage.id] = (positions[stage.id] ?? -1) + 1
    const leadNumber = await newLeadNumber(workspaceId)
    await db.deal.create({
      data: {
        workspaceId, leadNumber, title: `${item.name} · ${prop.titulo}`, value: String(prop.valor), currency: prop.moneda, probability: stage.probability,
        pipelineId: pipeline.id, stageId: stage.id, position: positions[stage.id], ownerId: item.owner ? users[item.owner].id : null,
        status: stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN', closedAt: stage.isWon || stage.isLost ? ago(last[0]) : null,
        closedReason: stage.isLost ? 'No avanzó' : null, stageEnteredAt: ago(last[0]), createdAt: ago(item.m[0][0]),
        customData: { demo: true, leadNumber, sourceChannel: item.network, socialConversationId: conversation.id, propiedad: prop.titulo, captador: prop.captador },
        contacts: { create: [{ contactId: contact.id }] },
      },
    })
  }
  console.log(`Instagram y Facebook: ${SOCIAL.length} conversaciones con sus leads (cuentas sin conectar)`)

  for (const post of POSTS) {
    await db.socialPost.create({ data: { workspaceId, network: 'instagram', caption: post.caption, image: fs.readFileSync(path.join(PHOTOS, post.foto)), imageMimeType: 'image/jpeg', imageFileName: `demo-${post.foto}`, createdByUserId: users[post.by].id } })
  }
  console.log(`Publicaciones de Instagram: ${POSTS.length} borradores`)
  if (!full) return

  // WhatsApp de Tickets
  const session = await db.whatsAppSession.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} })
  let number = (await db.ticket.aggregate({ where: { workspaceId }, _max: { number: true } }))._max.number ?? 0
  for (const t of TICKETS) {
    const last = t.m[t.m.length - 1]
    const contact = await db.contact.create({
      data: { workspaceId, firstName: t.name.split(' ')[0], lastName: t.name.split(' ').slice(1).join(' '), phone: phone(t.n), status: 'CUSTOMER', source: 'WHATSAPP', tags: [DEMO_TAG, 'whatsapp', 'postventa'] },
    })
    const chat = await db.whatsAppChat.create({
      data: {
        workspaceId, sessionId: session.id, jid: jidOf(t.n), phoneNumber: phone(t.n), phoneNumberSource: 'demo', displayName: t.name, contactId: contact.id,
        assignedToUserId: t.assignee ? users[t.assignee].id : null, unreadCount: t.status === 'NEW' ? 1 : 0,
        lastMessageAt: ago(last[0]), lastMessagePreview: last[2], lastMessageFromMe: last[1] !== 'c',
      },
    })
    number += 1
    const active = t.status !== 'RESOLVED' && t.status !== 'CLOSED'
    const ticket = await db.ticket.create({
      data: {
        workspaceId, number, subject: t.subject, status: t.status, priority: t.priority, contactId: contact.id, whatsappChatId: chat.id,
        assignedToUserId: t.assignee ? users[t.assignee].id : null, activeKey: active ? `whatsapp:${workspaceId}:${chat.id}` : null,
        openedAt: ago(t.m[0][0]), lastMessageAt: ago(last[0]), firstResponseAt: t.m.find((m) => m[1] !== 'c') ? ago(t.m.find((m) => m[1] !== 'c')[0]) : null,
        resolvedAt: active ? null : ago(last[0]),
      },
    })
    await db.ticketEvent.create({ data: { workspaceId, ticketId: ticket.id, type: 'CREATED', toValue: 'NEW', createdAt: ago(t.m[0][0]) } })
    for (const [i, [hours, from, text]] of t.m.entries()) {
      await db.whatsAppMessage.create({
        data: {
          workspaceId, sessionId: session.id, chatId: chat.id, remoteJid: chat.jid, messageId: `DEMOT${t.n}X${i}`, fromMe: from !== 'c',
          pushName: from === 'c' ? t.name : null, messageType: 'text', text, status: from === 'c' ? null : 'read', ticketId: ticket.id, sentAt: ago(hours),
        },
      })
    }
  }
  console.log(`Tickets: ${TICKETS.length} (postventa de inquilinos y propietarios)`)

  // Tareas
  for (const task of TASKS) {
    const due = new Date(now + task.inDays * 86_400_000)
    await db.task.create({
      data: {
        workspaceId, title: task.title, description: '[demo] Tarea de ejemplo', status: task.status ?? 'PENDING', priority: task.priority,
        assignedToUserId: users[task.assignee].id, createdByUserId: users.santi.id, dueDate: new Date(Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())),
      },
    })
  }
  console.log(`Tareas: ${TASKS.length}`)

  // Chat interno (el ‎​ final marca los mensajes de la demo para poder borrarlos)
  const general = await db.internalConversation.upsert({
    where: { workspaceId_key: { workspaceId, key: 'general' } },
    update: {},
    create: { workspaceId, type: 'GENERAL', key: 'general', title: 'Equipo Vicar' },
  })
  for (const userId of [owner?.userId, ...Object.values(users).map((u) => u.id)].filter(Boolean)) {
    await db.internalConversationParticipant.upsert({ where: { conversationId_userId: { conversationId: general.id, userId } }, update: {}, create: { conversationId: general.id, userId } })
  }
  for (const [hours, from, body] of TEAM_CHAT) {
    await db.internalChatMessage.create({ data: { workspaceId, conversationId: general.id, senderId: users[from].id, body: body + '​', createdAt: ago(hours) } })
  }
  await db.internalConversation.update({ where: { id: general.id }, data: { lastMessageAt: ago(TEAM_CHAT[TEAM_CHAT.length - 1][0]) } })
  console.log(`Chat interno: ${TEAM_CHAT.length} mensajes en "${general.title}"`)
}

main()
  .catch((error) => { console.error('ERROR', error.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())
