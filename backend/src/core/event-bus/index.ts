import { EventEmitter } from 'events'
import { Queue, Worker, type Job } from 'bullmq'
import crypto from 'crypto'
import { db } from '../database'
import { config } from '../config'
import type { CRMEvent } from '../../types'

// La forma del job que se encola en Redis
interface WebhookJob {
  webhookId: string
  url: string
  event: CRMEvent
  payload: unknown
  secret?: string
  workspaceId: string
}

export class EventBus {
  private emitter = new EventEmitter()
  private webhookQueue: Queue
  private webhookWorker: Worker

  // Recibe la URL de Redis como string en vez de la instancia
  constructor(redisUrl: string) {
    this.emitter.setMaxListeners(50)

    const isDev = process.env.NODE_ENV === 'development'

    if (isDev) {
      console.warn('⚠️ Ejecutando EventBus sin BullMQ/Redis (entorno local). Usando Fallback en memoria.')
      this.webhookQueue = {
        add: async (name: string, data: any, opts: any) => {
          setTimeout(() => this.processWebhook({ data } as any).catch(console.error), 500)
        }
      } as unknown as Queue
      return
    }

    // BullMQ crea su propia conexión internamente con la URL
    const connection = { url: redisUrl }

    this.webhookQueue = new Queue('webhooks', {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    })

    this.webhookWorker = new Worker<WebhookJob>(
      'webhooks',
      async (job) => this.processWebhook(job),
      {
        connection,
        concurrency: 10,
      }
    )

    this.webhookWorker.on('failed', (job, err) => {
      if (job) {
        console.error(` Webhook ${job.data.url} falló definitivamente:`, err.message)
        db.webhookEndpoint
          .update({
            where: { id: job.data.webhookId },
            data: { failureCount: { increment: 1 } },
          })
          .catch(() => {})
      }
    })
  }


  // ─── Emitir un evento ─────────────────────────────────────────────
  // Este es el método que van a llamar todos los servicios
  async emit(
    event: CRMEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    // 1. Notificar listeners locales (para futuro uso con WebSockets)
    this.emitter.emit(event, payload)

    const workspaceId = payload.workspaceId as string | undefined
    if (!workspaceId) return

    // 2. Guardar en EventLog — registro permanente de todo lo que pasó.
    // Se usa try/catch con await para que el error no pase desapercibido:
    // antes el .catch() silencioso podía perder eventos sin dejar rastro.
    try {
      await db.eventLog.create({ data: { workspaceId, event, payload: payload as any } })
    } catch (err: unknown) {
      console.error('EventLog error — el evento no se persistió:', err)
    }

    // 3. Despachar webhooks registrados para este evento
    await this.dispatchWebhooks(event, payload, workspaceId)
  }

  // Suscribirse a eventos locales
  on(event: CRMEvent | string, handler: (payload: unknown) => void): void {
    this.emitter.on(event, handler)
  }

  // ─── Buscar y encolar webhooks ────────────────────────────────────
  private async dispatchWebhooks(
    event: CRMEvent,
    payload: unknown,
    workspaceId: string
  ): Promise<void> {
    // Buscar todos los webhooks activos suscritos a este evento
    const webhooks = await db.webhookEndpoint.findMany({
      where: {
        workspaceId,
        isActive: true,
        events: { has: event }, // Prisma permite buscar dentro de arrays
      },
    })

    // Encolar cada webhook por separado
    // Si uno falla no afecta a los demás
    await Promise.all(
      webhooks.map((wh: { id: string; url: string; secret: string | null; events: string[] }) =>
        this.webhookQueue.add('send', {
          webhookId: wh.id,
          url: wh.url,
          event,
          payload,
          secret: wh.secret ?? undefined,
          workspaceId,
        } satisfies WebhookJob)
      )
    )
  }

  // ─── Procesar un webhook de la cola ──────────────────────────────
  private async processWebhook(job: Job<WebhookJob>): Promise<void> {
    const { webhookId, url, event, payload, secret } = job.data

    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CRM-Event': event,
      'X-CRM-Delivery': job.id ?? '',
    }

    // Si tiene secret, firmar el payload con HMAC-SHA256
    // n8n puede verificar esta firma para confirmar que el mensaje
    // viene realmente de tu CRM y no de alguien externo
    if (secret) {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex')
      headers['X-CRM-Signature'] = `sha256=${signature}`
    }

    // Timeout de 10s — si el endpoint no responde, cancelar el fetch.
    // Sin esto el worker queda colgado indefinidamente y puede bloquear
    // todos los slots de concurrencia de la cola.
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10_000)

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    // Actualizar estadísticas del webhook
    await db.webhookEndpoint.update({
      where: { id: webhookId },
      data: {
        lastTriggeredAt: new Date(),
        lastStatusCode: res.status,
        // Si respondió OK, resetear el contador de fallos
        failureCount: res.ok ? 0 : { increment: 1 },
      },
    })

    if (!res.ok) {
      // Lanzar error hace que BullMQ reintente el job
      throw new Error(`Webhook respondió con status ${res.status}`)
    }
  }

  // Cerrar conexiones limpiamente al apagar el servidor
  async close(): Promise<void> {
    await this.webhookWorker.close()
    await this.webhookQueue.close()
  }
}