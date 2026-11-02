import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '../../core/database'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { brand } from '../../core/brand'
import { AppError, ValidationError } from '../../types'
import { decodeAsset, isAssetKind, readBrandingText, writeBrandingText, type AssetKind } from './branding'

/**
 * La marca pública es la del workspace de la instancia: el de BRAND_SLUG o, si no
 * existe, el primero. El login la necesita antes de que haya sesión.
 */
async function publicWorkspace() {
  return await db.workspace.findUnique({ where: { slug: brand.slug }, select: { id: true, settings: true } })
    ?? await db.workspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, settings: true } })
}

/** Rutas relativas a la API; `?v=` cambia con cada subida para que el navegador no use una copia vieja. */
async function snapshot(workspace: { id: string; settings: unknown } | null) {
  if (!workspace) return { name: null, tagline: null, logo: null, logoDark: null, favicon: null }
  const assets = await db.workspaceAsset.findMany({ where: { workspaceId: workspace.id }, select: { kind: true, updatedAt: true } })
  const url = (kind: AssetKind) => {
    const asset = assets.find((item) => item.kind === kind)
    return asset ? `/branding/assets/${kind}?v=${asset.updatedAt.getTime()}` : null
  }
  return { ...readBrandingText(workspace.settings), logo: url('logo'), logoDark: url('logo-dark'), favicon: url('favicon') }
}

async function ownWorkspace(workspaceId: string) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, settings: true } })
  if (!workspace) throw new AppError(404, 'Espacio de trabajo no encontrado')
  return workspace
}

function assetKind(params: unknown): AssetKind {
  const { kind } = params as { kind: string }
  if (!isAssetKind(kind)) throw new AppError(404, 'Imagen de marca desconocida')
  return kind
}

const textSchema = z.preprocess((value) => value === '' ? null : value, z.string().trim().max(80).nullable().optional())

export async function brandingRoutes(app: FastifyInstance) {
  app.get('/', async (_req, reply) => reply.send(await snapshot(await publicWorkspace())))

  app.get('/assets/:kind', async (req, reply) => {
    const kind = assetKind(req.params)
    const workspace = await publicWorkspace()
    const asset = workspace
      ? await db.workspaceAsset.findUnique({ where: { workspaceId_kind: { workspaceId: workspace.id, kind } }, select: { mimeType: true, data: true } })
      : null
    if (!asset) throw new AppError(404, 'Sin imagen cargada')
    return reply
      .header('Content-Type', asset.mimeType)
      .header('Cache-Control', 'public, max-age=300')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'")
      .send(Buffer.from(asset.data))
  })

  const manage = { preHandler: [authenticate, requireRole('owner', 'admin')] }

  app.patch('/', manage, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const body = z.object({ name: textSchema, tagline: textSchema }).parse(req.body ?? {})
    const workspace = await ownWorkspace(ctx.workspaceId)
    const settings = writeBrandingText(workspace.settings, body) as Prisma.InputJsonValue
    const updated = await db.workspace.update({ where: { id: workspace.id }, data: { settings }, select: { id: true, settings: true } })
    return reply.send(await snapshot(updated))
  })

  // Las imágenes llegan como data URL: hasta 512 KB, que en base64 son ~700 KB.
  app.put('/assets/:kind', { ...manage, bodyLimit: 1024 * 1024 }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const kind = assetKind(req.params)
    const { dataUrl } = z.object({ dataUrl: z.string().min(1) }).parse(req.body)
    const decoded = decodeAsset(kind, dataUrl)
    if ('error' in decoded) throw new ValidationError(decoded.error)
    const workspace = await ownWorkspace(ctx.workspaceId)
    await db.workspaceAsset.upsert({
      where: { workspaceId_kind: { workspaceId: workspace.id, kind } },
      update: { mimeType: decoded.mimeType, data: decoded.data },
      create: { workspaceId: workspace.id, kind, mimeType: decoded.mimeType, data: decoded.data },
    })
    return reply.send(await snapshot(workspace))
  })

  app.delete('/assets/:kind', manage, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const kind = assetKind(req.params)
    const workspace = await ownWorkspace(ctx.workspaceId)
    await db.workspaceAsset.deleteMany({ where: { workspaceId: workspace.id, kind } })
    return reply.send(await snapshot(workspace))
  })
}
