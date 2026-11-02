import assert from 'node:assert/strict'
import test from 'node:test'
import { ValidationError } from '../../types'
import { DEFAULT_SERVICES } from './assistant.defaults'
import {
  bodyUsesPrice, buildFlowConfig, computeInsights, formatGuaranies, isValidTime, isValidTimezone, isWithinOfficeHours,
  normalizePhoneList, normalizeTextList, renderServiceBody, type InsightChat, type ServiceRow, type SettingsRow,
} from './assistant.logic'

const settings: SettingsRow = {
  enabled: true,
  testOnlyPhones: ['595981123456'],
  excludedPhones: [],
  notifyTo: '595991000111',
  pauseHours: 8,
  waitSeconds: 6,
  maxAudioSeconds: 150,
  maxRepliesPerHour: 10,
  timezone: 'America/Asuncion',
  officeDays: [1, 2, 3, 4, 5],
  officeFrom: '08:00',
  officeTo: '18:00',
  followUpEnabled: false,
  followUpHours: 22,
  followUpFrom: '08:30',
  followUpTo: '18:00',
  followUpMessage: 'Buenas {{nombre}}',
  fallbackMessage: 'No puedo ahora',
  extraInstructions: '',
  handoffTopics: ['SRL o SA'],
  crmSyncEnabled: false,
  updatedAt: new Date('2026-11-02T12:00:00Z'),
}

const services: ServiceRow[] = DEFAULT_SERVICES.map((service, sortOrder) => ({ ...service, active: true, sortOrder }))

test('formatGuaranies agrupa de a tres con punto', () => {
  assert.equal(formatGuaranies('880000'), '880.000')
  assert.equal(formatGuaranies(2750000), '2.750.000')
  assert.equal(formatGuaranies('150'), '150')
  assert.equal(formatGuaranies('0001000'), '1.000')
})

test('renderServiceBody reemplaza todas las apariciones de {{precio}}', () => {
  assert.equal(renderServiceBody('Gs. {{precio}} y de nuevo Gs. {{precio}}', '440000'), 'Gs. 440.000 y de nuevo Gs. 440.000')
  assert.equal(renderServiceBody('Sin precio', null), 'Sin precio')
})

test('renderServiceBody rechaza un texto con {{precio}} sin monto', () => {
  assert.equal(bodyUsesPrice('Gs. {{precio}}'), true)
  assert.throws(() => renderServiceBody('Gs. {{precio}}', null), ValidationError)
  assert.throws(() => renderServiceBody('Gs. {{precio}}', ''), ValidationError)
})

test('los servicios iniciales se renderizan con los precios que usa el equipo', () => {
  const rendered = Object.fromEntries(DEFAULT_SERVICES.map((service) => [service.code, renderServiceBody(service.body, service.amount)]))
  assert.match(rendered.EAS_COSTO, /Creación de EAS – Gs\. 880\.000/)
  assert.match(rendered.EAS_CONTABLE, /Gs\. 440\.000 mensuales/)
  assert.equal((rendered.EAS_CONTABLE.match(/440\.000/g) ?? []).length, 2)
  assert.match(rendered.EAS_LIBROS, /Gs\. 2\.750\.000/)
  assert.match(rendered.IVA_HABILITACION, /Gs\. 150\.000\.$/)
  assert.ok(!Object.values(rendered).some((text) => text.includes('{{')))
  assert.equal(new Set(DEFAULT_SERVICES.map((service) => service.code)).size, DEFAULT_SERVICES.length)
})

test('normalizePhoneList deja sólo dígitos, sin repetidos, y rechaza números inválidos', () => {
  assert.deepEqual(normalizePhoneList(['+595 981 123-456', '595981123456', '  ']), ['595981123456'])
  assert.throws(() => normalizePhoneList(['1234']), ValidationError)
  assert.throws(() => normalizePhoneList(['1'.repeat(16)]), ValidationError)
})

test('normalizeTextList limpia espacios y repetidos', () => {
  assert.deepEqual(normalizeTextList(['  SRL   o SA ', 'SRL o SA', ''], 50), ['SRL o SA'])
  assert.throws(() => normalizeTextList(['x'.repeat(51)], 50), ValidationError)
})

test('validación de hora y zona horaria', () => {
  assert.equal(isValidTime('08:30'), true)
  assert.equal(isValidTime('24:00'), false)
  assert.equal(isValidTime('8:30'), false)
  assert.equal(isValidTimezone('America/Asuncion'), true)
  assert.equal(isValidTimezone('Mars/Olympus'), false)
})

test('buildFlowConfig arma lo que lee n8n: bloques con precio y catálogo sin montos', () => {
  const config = buildFlowConfig(settings, services)
  assert.equal(config.config.botActivo, true)
  assert.equal(config.config.soloPrueba, '595981123456')
  assert.equal(config.config.atencionDias, '1,2,3,4,5')
  assert.equal(config.config.notificarA, '595991000111')
  assert.match(config.bloques.EAS_COSTO, /Gs\. 880\.000/)
  assert.deepEqual(Object.keys(config.bloques), Object.keys(config.catalogo))
  assert.ok(!Object.values(config.catalogo).some((text) => /\d{1,3}\.\d{3}/.test(text)), 'el modelo no debe ver montos')
  assert.deepEqual(config.sinTarifa, ['SRL o SA'])
})

test('buildFlowConfig ignora servicios apagados y respeta el orden', () => {
  const reordered = services.map((service, index) => ({ ...service, sortOrder: services.length - index, active: service.code !== 'UBICACION' }))
  const config = buildFlowConfig(settings, reordered)
  assert.ok(!('UBICACION' in config.bloques))
  assert.equal(Object.keys(config.bloques)[0], 'IVA_HABILITACION')
})

test('buildFlowConfig falla si un servicio activo usa {{precio}} sin monto', () => {
  assert.throws(() => buildFlowConfig(settings, [{ ...services[0], amount: null }]), ValidationError)
})

test('isWithinOfficeHours usa la hora de Paraguay (UTC-3) y los días configurados', () => {
  const office = { timezone: 'America/Asuncion', days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00' }
  assert.equal(isWithinOfficeHours(new Date('2026-11-02T14:00:00Z'), office), true) // lunes 11:00
  assert.equal(isWithinOfficeHours(new Date('2026-11-02T10:30:00Z'), office), false) // lunes 07:30
  assert.equal(isWithinOfficeHours(new Date('2026-11-02T21:00:00Z'), office), false) // lunes 18:00 (límite excluido)
  assert.equal(isWithinOfficeHours(new Date('2026-11-07T14:00:00Z'), office), false) // sábado
})

function message(fromMe: boolean, iso: string, extra: Partial<InsightChat['messages'][number]> = {}) {
  return { fromMe, sentAt: new Date(iso), messageType: 'text', text: null, sentByUserId: null, ...extra }
}

test('computeInsights mide leads, respuesta, horarios y repetidos', () => {
  const office = { timezone: 'America/Asuncion', days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00' }
  const greeting = 'Buenas Le saluda el Lic. José Rojas'
  const chats: InsightChat[] = [
    // Lead de noche (23:00 local del domingo), respondido a las 10:00 del lunes: 11 h.
    { id: 'a', displayName: 'Ana', phoneNumber: '595981000111', messages: [message(false, '2026-11-02T02:00:00Z'), message(true, '2026-11-02T13:00:00Z', { text: greeting, sentByUserId: 'u1' })] },
    // Lead de día, respondido en 5 minutos desde el teléfono.
    { id: 'b', displayName: null, phoneNumber: '595981000222', messages: [message(false, '2026-11-02T14:00:00Z'), message(true, '2026-11-02T14:05:00Z', { text: greeting })] },
    // Lead sin respuesta (con audio).
    { id: 'c', displayName: 'Carlos', phoneNumber: '595981009876', messages: [message(false, '2026-11-02T15:00:00Z', { messageType: 'audio' })] },
    // Chat que empezó el equipo: no cuenta como lead.
    { id: 'd', displayName: 'Cliente actual', phoneNumber: '595981555555', messages: [message(true, '2026-11-02T15:00:00Z', { text: 'Le paso el dato' })] },
  ]
  const result = computeInsights(chats, new Date('2026-11-02T18:00:00Z'), office)
  assert.equal(result.leads, 3)
  assert.equal(result.answered, 2)
  assert.equal(result.unanswered, 1)
  assert.equal(result.offHoursLeads, 1)
  assert.equal(result.firstResponse.samples, 2)
  assert.equal(result.firstResponse.medianMinutes, 660)
  assert.equal(result.firstResponse.buckets.find((bucket) => bucket.key === 'lt15m')?.count, 1)
  assert.equal(result.firstResponse.buckets.find((bucket) => bucket.key === '2h-12h')?.count, 1)
  assert.equal(result.leadsByHour[23], 1)
  assert.equal(result.leadsByHour[11], 1)
  assert.deepEqual(result.leadsByDay, [{ day: '2026-11-01', count: 1 }, { day: '2026-11-02', count: 2 }])
  assert.equal(result.messages.outboundFromCrm, 1)
  assert.equal(result.messages.outboundFromPhone, 2)
  assert.equal(result.messages.audios, 1)
  assert.equal(result.repeatedReplies.repeatedMessages, 2)
  assert.equal(result.repeatedReplies.textMessages, 3)
  assert.equal(result.repeatedReplies.share, 67)
  assert.equal(result.repeatedReplies.top[0].count, 2)
  assert.deepEqual(result.pending, [{ chatId: 'c', name: 'Carlos', phoneTail: '9876', waitingMinutes: 180 }])
})

test('computeInsights sin datos devuelve ceros y no rompe', () => {
  const result = computeInsights([], new Date(), { timezone: 'America/Asuncion', days: [1], from: '08:00', to: '18:00' })
  assert.equal(result.leads, 0)
  assert.equal(result.firstResponse.medianMinutes, null)
  assert.equal(result.repeatedReplies.share, 0)
  assert.deepEqual(result.pending, [])
})
