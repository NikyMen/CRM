import type { FastifyInstance } from 'fastify'
import { db } from '../../core/database'
import { authenticate } from '../../core/auth/auth.service'

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  app.get('/', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const { workspaceId } = ctx

    // Ejecutar todas las queries en paralelo para mayor velocidad
    const [
      totalContacts,
      contactsByStatus,
      totalDeals,
      dealsByStage,
      recentActivities,
      recentContacts,
      stockProducts,
    ] = await Promise.all([

      // Total de contactos activos
      db.contact.count({
        where: { workspaceId, isArchived: false },
      }),

      // Contactos agrupados por estado
      db.contact.groupBy({
        by:     ['status'],
        where:  { workspaceId, isArchived: false },
        _count: { id: true },
      }),

      // Total de deals abiertos
      db.deal.count({
        where: { workspaceId, isArchived: false, status: 'OPEN' },
      }),

      // Deals agrupados por stage con valor total
      db.deal.groupBy({
        by:     ['stageId'],
        where:  { workspaceId, isArchived: false, status: 'OPEN' },
        _count: { id: true },
        _sum:   { value: true },
      }),

      // Últimas 10 actividades
      db.activity.findMany({
        where:   { workspaceId },
        orderBy: { createdAt: 'desc' },
        take:    10,
        include: {
          contact: {
            select: { firstName: true, lastName: true },
          },
        },
      }),

      // Últimos 5 contactos creados
      db.contact.findMany({
        where:   { workspaceId, isArchived: false },
        orderBy: { createdAt: 'desc' },
        take:    5,
        select: {
          id:        true,
          firstName: true,
          lastName:  true,
          status:    true,
          score:     true,
          createdAt: true,
        },
      }),

      db.stockProduct.findMany({
        where: { workspaceId, isArchived: false },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          stockQuantity: true,
          minStock: true,
          updatedAt: true,
        },
      }),
    ])

    // Enriquecer dealsByStage con el nombre de la etapa
    const stageIds = dealsByStage.map((d: any) => d.stageId)
    const stages   = await db.stage.findMany({
      where:  { id: { in: stageIds } },
      select: { id: true, name: true, color: true },
    })

    const stagesMap = Object.fromEntries(stages.map((s: any) => [s.id, s]))

    // Valor total en pipeline
    const pipelineValue = dealsByStage.reduce(
      (sum: any, d: any) => sum + Number(d._sum.value ?? 0), 0
    )

    const lowStockProducts = stockProducts
      .filter((p: any) => p.stockQuantity > 0 && p.stockQuantity <= p.minStock)
      .sort((a: any, b: any) => a.stockQuantity - b.stockQuantity)
    const outOfStockProducts = stockProducts.filter((p: any) => p.stockQuantity <= 0)
    const unitsInStock = stockProducts.reduce(
      (sum: number, p: any) => sum + Number(p.stockQuantity ?? 0),
      0
    )
    const inventoryValue = stockProducts.reduce(
      (sum: number, p: any) => sum + Number(p.price ?? 0) * Number(p.stockQuantity ?? 0),
      0
    )

    return reply.send({
      contacts: {
        total:    totalContacts,
        byStatus: contactsByStatus.map((s: any) => ({
          status: s.status,
          count:  s._count.id,
        })),
        recent: recentContacts,
      },
      deals: {
        total:         totalDeals,
        pipelineValue,
        byStage: dealsByStage.map((d: any) => ({
          stageId:   d.stageId,
          stageName: stagesMap[d.stageId]?.name ?? 'Desconocido',
          color:     stagesMap[d.stageId]?.color ?? '#6366f1',
          count:     d._count.id,
          value:     d._sum.value ?? 0,
        })),
      },
      stock: {
        totalProducts: stockProducts.length,
        unitsInStock,
        lowStockProducts: lowStockProducts.length,
        outOfStockProducts: outOfStockProducts.length,
        inventoryValue,
        criticalProducts: lowStockProducts.slice(0, 5).map((p: any) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          stockQuantity: p.stockQuantity,
          minStock: p.minStock,
          updatedAt: p.updatedAt,
        })),
      },
      recentActivities: recentActivities.map((a: any) => ({
        id:          a.id,
        type:        a.type,
        title:       a.title,
        contactName: a.contact
          ? `${a.contact.firstName} ${a.contact.lastName ?? ''}`
          : null,
        createdAt: a.createdAt,
      })),
    })
  })
}
