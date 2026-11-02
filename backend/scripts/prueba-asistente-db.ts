/**
 * Prueba de integración del módulo del asistente contra una base real (no forma parte de `pnpm test`).
 * Uso:  DATABASE_URL=postgresql://... pnpm exec tsx scripts/prueba-asistente-db.ts
 * Crea su propio workspace de prueba y lo borra al terminar.
 */
import assert from 'node:assert/strict'
import { db } from '../src/core/database'
import { AssistantService } from '../src/modules/assistant/assistant.service'
import type { WorkspaceContext } from '../src/types'

const service = new AssistantService()
let passed = 0
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log('  ✔', name) } catch (error) { console.log('  ✘', name, '\n     ', (error as Error).message); process.exitCode = 1 }
}

async function main() {
  const workspace = await db.workspace.create({ data: { name: 'Prueba asistente', slug: `prueba-asistente-${Date.now()}` } })
  const ctx = { workspaceId: workspace.id, userId: 'u', role: 'owner' } as WorkspaceContext
  try {
    await check('la primera lectura crea los ajustes (apagado) y carga los 6 servicios iniciales', async () => {
      const settings = await service.getSettings(ctx)
      assert.equal(settings.enabled, false)
      assert.ok(settings.handoffTopics.length >= 4)
      const services = await service.listServices(ctx)
      assert.equal(services.length, 6)
      assert.equal(services[0].code, 'EAS_COSTO')
      assert.equal(services[0].amount, '880000')
      assert.match(services[0].rendered ?? '', /Gs\. 880\.000/)
    })

    await check('lecturas simultáneas no duplican los servicios iniciales', async () => {
      const other = await db.workspace.create({ data: { name: 'Carrera', slug: `carrera-${Date.now()}` } })
      try {
        const c = { workspaceId: other.id, userId: 'u', role: 'owner' } as WorkspaceContext
        await Promise.all([service.getSettings(c), service.listServices(c), service.listServices(c)])
        assert.equal((await service.listServices(c)).length, 6)
      } finally { await db.workspace.delete({ where: { id: other.id } }) }
    })

    await check('cambiar el precio actualiza todos los lugares del texto', async () => {
      const [costo] = await service.listServices(ctx)
      const updated = await service.updateService(ctx, costo.id, { title: costo.title, description: costo.description, body: costo.body, amount: '950000', active: true })
      assert.equal(updated.amount, '950000')
      assert.match(updated.rendered ?? '', /Gs\. 950\.000/)
      assert.ok(!(updated.rendered ?? '').includes('880.000'))
    })

    await check('un texto con {{precio}} sin precio se rechaza', async () => {
      const [costo] = await service.listServices(ctx)
      await assert.rejects(() => service.updateService(ctx, costo.id, { title: costo.title, description: costo.description, body: costo.body, amount: null, active: true }), /precio/)
    })

    await check('crear un servicio repetido da conflicto y uno nuevo queda al final', async () => {
      await assert.rejects(() => service.createService(ctx, 'EAS_COSTO', { title: 'x', description: '', body: 'x', amount: null, active: true }), /Ya existe/)
      const created = await service.createService(ctx, 'ALTA_RUC', { title: 'Alta de RUC', description: 'Costo del alta', body: 'Alta de RUC: Gs. {{precio}}', amount: '200000', active: true })
      assert.equal(created.sortOrder, 6)
      assert.equal(created.rendered, 'Alta de RUC: Gs. 200.000')
    })

    await check('un servicio de otro workspace no se puede tocar', async () => {
      const [costo] = await service.listServices(ctx)
      const intruso = { workspaceId: 'otro-workspace', userId: 'u', role: 'owner' } as WorkspaceContext
      await assert.rejects(() => service.updateService(intruso, costo.id, { title: 'x', description: '', body: 'x', amount: null, active: true }), /no encontrado/)
      await assert.rejects(() => service.removeService(intruso, costo.id), /no encontrado/)
    })

    await check('reordenar guarda el nuevo orden', async () => {
      const before = await service.listServices(ctx)
      const ids = before.map((s) => s.id).reverse()
      const after = await service.reorderServices(ctx, ids)
      assert.deepEqual(after.map((s) => s.id), ids)
    })

    await check('la configuración para n8n trae bloques con precio, sin montos en el catálogo, y respeta servicios apagados', async () => {
      const services = await service.listServices(ctx)
      const ubicacion = services.find((s) => s.code === 'UBICACION')!
      await service.updateService(ctx, ubicacion.id, { title: ubicacion.title, description: ubicacion.description, body: ubicacion.body, amount: null, active: false })
      const config = await service.flowConfig(ctx.workspaceId)
      assert.ok(!('UBICACION' in config.bloques))
      assert.match(config.bloques.EAS_COSTO, /Gs\. 950\.000/)
      assert.ok(!Object.values(config.catalogo).some((text) => /\d{1,3}\.\d{3}/.test(text)))
      assert.equal(config.config.botActivo, false)
    })

    await check('guardar ajustes normaliza teléfonos y días', async () => {
      const current = await service.getSettings(ctx)
      const saved = await service.updateSettings(ctx, {
        enabled: true, testOnlyPhones: ['+595 981 123-456', '595981123456'], excludedPhones: [], notifyTo: '(0991) 000-111',
        pauseHours: current.pauseHours, waitSeconds: current.waitSeconds, maxAudioSeconds: current.maxAudioSeconds, maxRepliesPerHour: current.maxRepliesPerHour,
        timezone: current.timezone, officeDays: [3, 1, 3, 2], officeFrom: '09:00', officeTo: '17:00', followUpEnabled: false, followUpHours: 22,
        followUpFrom: '08:30', followUpTo: '18:00', followUpMessage: current.followUpMessage, fallbackMessage: current.fallbackMessage,
        extraInstructions: 'Sin reuniones los viernes', handoffTopics: ['SRL o SA', 'SRL o SA', '  Marcas  '], crmSyncEnabled: false,
      })
      assert.deepEqual(saved.testOnlyPhones, ['595981123456'])
      assert.equal(saved.notifyTo, '0991000111')
      assert.deepEqual(saved.officeDays, [1, 2, 3])
      assert.deepEqual(saved.handoffTopics, ['SRL o SA', 'Marcas'])
      assert.equal((await service.flowConfig(ctx.workspaceId)).config.soloPrueba, '595981123456')
    })

    await check('restaurar iniciales vuelve a crear sólo los que faltan', async () => {
      const costo = (await service.listServices(ctx)).find((s) => s.code === 'EAS_COSTO')!
      await service.removeService(ctx, costo.id)
      const result = await service.restoreDefaults(ctx)
      assert.deepEqual(result.restored, ['EAS_COSTO'])
      assert.equal(result.services.length, 7)
    })

    await check('las métricas leen la línea comercial: leads, respuesta y pendientes', async () => {
      const t0 = new Date(Date.now() - 5 * 3600_000)
      const chat = (jid: string, name: string) => db.collectionWhatsAppChat.create({ data: { workspaceId: ctx.workspaceId, line: 'commercial', jid, displayName: name, phoneNumber: jid.split('@')[0] } })
      const a = await chat('595981000111@s.whatsapp.net', 'Ana')
      const b = await chat('595981000222@s.whatsapp.net', 'Beto')
      const distinto = await db.collectionWhatsAppChat.create({ data: { workspaceId: ctx.workspaceId, line: 'collections', jid: '595981000333@s.whatsapp.net' } })
      const msg = (chatId: string, id: string, fromMe: boolean, at: Date, text: string) => db.collectionWhatsAppMessage.create({ data: { workspaceId: ctx.workspaceId, chatId, messageId: id, fromMe, sentAt: at, text } })
      await msg(a.id, 'a1', false, t0, 'Hola')
      await msg(a.id, 'a2', true, new Date(t0.getTime() + 10 * 60_000), 'Buenas Le saluda el Lic. José Rojas')
      await msg(b.id, 'b1', false, new Date(t0.getTime() + 60_000), 'Quiero información')
      await msg(distinto.id, 'c1', false, t0, 'Cobranzas, no cuenta')
      const insights = await service.insights(ctx, 7)
      assert.equal(insights.leads, 2)
      assert.equal(insights.answered, 1)
      assert.equal(insights.unanswered, 1)
      assert.equal(insights.firstResponse.medianMinutes, 10)
      assert.equal(insights.pending.length, 1)
      assert.equal(insights.pending[0].name, 'Beto')
      assert.equal(insights.pending[0].phoneTail, '0222')
    })
  } finally {
    await db.workspace.delete({ where: { id: workspace.id } })
  }
  const left = await db.assistantSettings.count({ where: { workspaceId: workspace.id } })
  assert.equal(left, 0, 'quedaron datos de prueba')
  console.log(`\n${passed} pruebas de integración OK${process.exitCode ? ' (con fallas)' : ''}`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
