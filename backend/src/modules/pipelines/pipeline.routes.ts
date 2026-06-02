import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../core/database'
import { authenticate } from '../../core/auth/auth.service'
import { AppError } from '../../types'
import { requireRole } from '../../core/auth/require-role'
import { getPipelineScopeFilter } from '../../core/scope'

export async function pipelineRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  // ─── Listar pipelines ─────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const ctx = req.user as any
    
    const scopeFilter = getPipelineScopeFilter({
      role: ctx.role,
      branchId: ctx.branchId,
      regionId: ctx.regionId,
    })

    const pipelines = await db.pipeline.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...scopeFilter,
      },
      include: {
        stages: {
          orderBy: { position: 'asc' },
          include: { targetBranch: true, targetRegion: true },
        },
        branch: true,
        region: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(pipelines)
  })

  // ─── Crear pipeline ───────────────────────────────────────────
  app.post('/', { preHandler: requireRole('owner', 'regional_manager', 'branch_manager') }, async (req, reply) => {
    const ctx = req.user as any
    const body = z.object({
      name: z.string().min(1),
      regionId: z.string().nullable().optional(),
      branchId: z.string().nullable().optional(),
    }).parse(req.body)

    let finalBranchId = body.branchId || null
    let finalRegionId = body.regionId || null

    if (ctx.role === 'branch_manager') {
      if (!ctx.branchId) {
        throw new AppError(403, 'No tienes sucursal asignada')
      }
      finalBranchId = ctx.branchId
      finalRegionId = ctx.regionId || null
    } else if (ctx.role === 'regional_manager') {
      if (!ctx.regionId) {
        throw new AppError(403, 'No tienes región asignada')
      }
      finalRegionId = ctx.regionId
      if (body.branchId) {
        const branch = await db.branch.findFirst({
          where: { id: body.branchId, regionId: ctx.regionId, workspaceId: ctx.workspaceId },
        })
        if (!branch) {
          throw new AppError(403, 'No puedes crear un pipeline para una sucursal fuera de tu región')
        }
        finalBranchId = body.branchId
      } else {
        finalBranchId = null
      }
    } else {
      // Owner
      if (body.branchId) {
        const branch = await db.branch.findFirst({
          where: { id: body.branchId, workspaceId: ctx.workspaceId },
        })
        if (branch) {
          finalRegionId = branch.regionId
        }
      }
    }

    const pipeline = await db.pipeline.create({
      data: {
        workspaceId: ctx.workspaceId,
        name:        body.name,
        branchId:    finalBranchId,
        regionId:    finalRegionId,
      },
      include: {
        stages: {
          orderBy: { position: 'asc' },
          include: { targetBranch: true, targetRegion: true },
        },
        branch: true,
        region: true,
      },
    })
    return reply.status(201).send(pipeline)
  })

  // ─── Actualizar pipeline ──────────────────────────────────────
  app.patch('/:id', { preHandler: requireRole('owner', 'regional_manager', 'branch_manager') }, async (req, reply) => {
    const ctx    = req.user as any
    const { id } = req.params as { id: string }
    const body   = z.object({
      name: z.string().min(1),
      regionId: z.string().nullable().optional(),
      branchId: z.string().nullable().optional(),
    }).parse(req.body)

    const scopeFilter = getPipelineScopeFilter({
      role: ctx.role,
      branchId: ctx.branchId,
      regionId: ctx.regionId,
    })

    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId, ...scopeFilter },
    })
    if (!pipeline) throw new AppError(404, 'Pipeline no encontrado')

    let finalBranchId = body.branchId
    let finalRegionId = body.regionId

    if (ctx.role === 'branch_manager') {
      finalBranchId = ctx.branchId
      finalRegionId = ctx.regionId
    } else if (ctx.role === 'regional_manager') {
      finalRegionId = ctx.regionId
      if (body.branchId !== undefined) {
        if (body.branchId) {
          const branch = await db.branch.findFirst({
            where: { id: body.branchId, regionId: ctx.regionId, workspaceId: ctx.workspaceId },
          })
          if (!branch) {
            throw new AppError(403, 'No puedes asignar el pipeline a una sucursal fuera de tu región')
          }
          finalBranchId = body.branchId
        } else {
          finalBranchId = null
        }
      }
    } else {
      // Owner
      if (body.branchId) {
        const branch = await db.branch.findFirst({
          where: { id: body.branchId, workspaceId: ctx.workspaceId },
        })
        if (branch) {
          finalRegionId = branch.regionId
        }
      } else if (body.branchId === null) {
        if (body.regionId === undefined) {
          finalRegionId = null
        }
      }
    }

    const updated = await db.pipeline.update({
      where:   { id },
      data:    {
        name: body.name,
        ...(finalBranchId !== undefined && { branchId: finalBranchId }),
        ...(finalRegionId !== undefined && { regionId: finalRegionId }),
      },
      include: {
        stages: {
          orderBy: { position: 'asc' },
          include: { targetBranch: true, targetRegion: true },
        },
        branch: true,
        region: true,
      },
    })
    return reply.send(updated)
  })

  // ─── Eliminar pipeline ────────────────────────────────────────
  app.delete('/:id', { preHandler: requireRole('owner', 'regional_manager', 'branch_manager') }, async (req, reply) => {
    const ctx    = req.user as any
    const { id } = req.params as { id: string }

    const scopeFilter = getPipelineScopeFilter({
      role: ctx.role,
      branchId: ctx.branchId,
      regionId: ctx.regionId,
    })

    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId, ...scopeFilter },
    })
    if (!pipeline) throw new AppError(404, 'Pipeline no encontrado')

    await db.pipeline.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ─── Crear stage ──────────────────────────────────────────────
  app.post('/:id/stages', { preHandler: requireRole('owner', 'regional_manager', 'branch_manager') }, async (req, reply) => {
    const ctx    = req.user as any
    const { id } = req.params as { id: string }
    const body   = z.object({
      name:  z.string().min(1),
      color: z.string().default('#6366f1'),
      targetBranchId: z.string().nullable().optional(),
      targetRegionId: z.string().nullable().optional(),
    }).parse(req.body)

    if (body.targetBranchId && body.targetRegionId) {
      throw new AppError(400, 'Una etapa no puede estar vinculada a una sucursal y a una región al mismo tiempo')
    }

    if (body.targetBranchId) {
      const branchExists = await db.branch.findFirst({
        where: { id: body.targetBranchId, workspaceId: ctx.workspaceId }
      })
      if (!branchExists) throw new AppError(404, 'La sucursal de destino no existe')
    }

    if (body.targetRegionId) {
      const regionExists = await db.region.findFirst({
        where: { id: body.targetRegionId, workspaceId: ctx.workspaceId }
      })
      if (!regionExists) throw new AppError(404, 'La región de destino no existe')
    }

    const scopeFilter = getPipelineScopeFilter({
      role: ctx.role,
      branchId: ctx.branchId,
      regionId: ctx.regionId,
    })

    const pipeline = await db.pipeline.findFirst({
      where:   { id, workspaceId: ctx.workspaceId, ...scopeFilter },
      include: { stages: true },
    })
    if (!pipeline) throw new AppError(404, 'Pipeline no encontrado')

    const position = Number(pipeline.stages.length)

    const stage = await db.stage.create({
      data: {
        pipelineId: id,
        name:       body.name,
        color:      body.color,
        position,
        targetBranchId: body.targetBranchId || null,
        targetRegionId: body.targetRegionId || null,
      },
    })
    return reply.status(201).send(stage)
  })

  // ─── Actualizar stage ─────────────────────────────────────────
  app.patch('/:id/stages/:stageId', { preHandler: requireRole('owner', 'regional_manager', 'branch_manager') }, async (req, reply) => {
    const ctx = req.user as any
    const { id, stageId } = req.params as { id: string; stageId: string }
    const body = z.object({
      name:  z.string().min(1).optional(),
      color: z.string().optional(),
      targetBranchId: z.string().nullable().optional(),
      targetRegionId: z.string().nullable().optional(),
    }).parse(req.body)

    if (body.targetBranchId && body.targetRegionId) {
      throw new AppError(400, 'Una etapa no puede estar vinculada a una sucursal y a una región al mismo tiempo')
    }

    if (body.targetBranchId) {
      const branchExists = await db.branch.findFirst({
        where: { id: body.targetBranchId, workspaceId: ctx.workspaceId }
      })
      if (!branchExists) throw new AppError(404, 'La sucursal de destino no existe')
    }

    if (body.targetRegionId) {
      const regionExists = await db.region.findFirst({
        where: { id: body.targetRegionId, workspaceId: ctx.workspaceId }
      })
      if (!regionExists) throw new AppError(404, 'La región de destino no existe')
    }

    const scopeFilter = getPipelineScopeFilter({
      role: ctx.role,
      branchId: ctx.branchId,
      regionId: ctx.regionId,
    })

    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId, ...scopeFilter },
    })
    if (!pipeline) throw new AppError(404, 'Pipeline no encontrado')

    const stage = await db.stage.update({
      where: { id: stageId },
      data:  {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.targetBranchId !== undefined && { targetBranchId: body.targetBranchId }),
        ...(body.targetRegionId !== undefined && { targetRegionId: body.targetRegionId }),
      },
    })
    return reply.send(stage)
  })

  // ─── Eliminar stage ───────────────────────────────────────────
  app.delete('/:id/stages/:stageId', { preHandler: requireRole('owner', 'regional_manager', 'branch_manager') }, async (req, reply) => {
    const ctx = req.user as any
    const { id, stageId } = req.params as { id: string; stageId: string }

    const scopeFilter = getPipelineScopeFilter({
      role: ctx.role,
      branchId: ctx.branchId,
      regionId: ctx.regionId,
    })

    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId, ...scopeFilter },
    })
    if (!pipeline) throw new AppError(404, 'Pipeline no encontrado')

    await db.stage.delete({ where: { id: stageId } })
    return reply.status(204).send()
  })
}
