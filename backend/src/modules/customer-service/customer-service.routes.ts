import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../core/auth/auth.service'
import type { TicketActor } from '../tickets/ticket.service'
import { CustomerServiceService } from './customer-service.service'

export async function customerServiceRoutes(app: FastifyInstance) {
  const service = new CustomerServiceService()

  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  app.get('/summary', async (req, reply) => {
    const actor = req.user as TicketActor
    return reply.send(await service.summary(actor))
  })
}
