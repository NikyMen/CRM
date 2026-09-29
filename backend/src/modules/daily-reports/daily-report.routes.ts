import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { requireModule } from '../../core/modules/require-module'
import type { WorkspaceContext } from '../../types'
import { paraguayToday } from './daily-report-calculations'
import { dailyReportFileName, renderDailyReportPdf } from './daily-report-pdf'
import { DailyReportService, type DailyReportInput } from './daily-report.service'

const dateKey = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')

const emptyToNull = (value: unknown) => value === '' || value === undefined ? null : value

const itemSchema = z.object({
  companyId: z.preprocess(emptyToNull, z.string().min(1).nullable()),
  description: z.string().trim().min(1).max(500),
  minutes: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(1440).nullable()),
  isDone: z.boolean().default(true),
})

const countSchema = z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(100000).nullable())

const saveSchema = z.object({
  date: dateKey,
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
  physicalCount: countSchema,
  migratedCount: countSchema,
  items: z.array(itemSchema).max(100),
})

export async function dailyReportRoutes(app: FastifyInstance) {
  const service = new DailyReportService()
  app.addHook('onRequest', async (req) => authenticate(req))
  app.addHook('onRequest', requireModule('daily-reports'))

  app.get('/mine', async (req, reply) => {
    const { date } = z.object({ date: dateKey.optional() }).parse(req.query)
    return reply.send(await service.getMine(req.user as WorkspaceContext, date ?? paraguayToday()))
  })

  app.put('/mine', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const { date, ...input } = saveSchema.parse(req.body)
    return reply.send(await service.saveMine(req.user as WorkspaceContext, date, input as DailyReportInput))
  })

  app.post('/mine/submit', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const { date } = z.object({ date: dateKey }).parse(req.body)
    return reply.send(await service.submitMine(req.user as WorkspaceContext, date))
  })

  app.get('/team', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const { date } = z.object({ date: dateKey.optional() }).parse(req.query)
    return reply.send(await service.teamDay(req.user as WorkspaceContext, date ?? paraguayToday()))
  })

  app.get('/team/pdf', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const { date } = z.object({ date: dateKey.optional() }).parse(req.query)
    const day = await service.teamDay(req.user as WorkspaceContext, date ?? paraguayToday())
    const fileName = dailyReportFileName(day.date)
    const asciiName = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
    return reply.header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`)
      .type('application/pdf').send(renderDailyReportPdf(day))
  })

  app.post('/:id/reopen', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    return reply.send(await service.reopen(req.user as WorkspaceContext, id))
  })
}
