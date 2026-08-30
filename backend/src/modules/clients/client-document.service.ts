import crypto from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '../../core/database'
import { config } from '../../core/config'
import { ForbiddenError, NotFoundError, ValidationError, type WorkspaceContext } from '../../types'
import { canManageAllClients, ensureClientAccess } from './client-access'

const documentsRoot = path.resolve(config.CLIENT_DOCUMENTS_DIR || path.join(process.cwd(), '.data', 'client-documents'))

const allowedDocumentTypes = new Map<string, Set<string>>([
  ['.pdf', new Set(['application/pdf'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.png', new Set(['image/png'])],
  ['.webp', new Set(['image/webp'])],
  ['.doc', new Set(['application/msword'])],
  ['.docx', new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])],
  ['.xls', new Set(['application/vnd.ms-excel'])],
  ['.xlsx', new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])],
  ['.csv', new Set(['text/csv', 'application/csv'])],
  ['.txt', new Set(['text/plain'])],
])

function startsWithBytes(buffer: Buffer, signature: number[]) {
  return buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte)
}

function validateDocumentContents(extension: string, buffer: Buffer) {
  if (!buffer.length) throw new ValidationError('El documento está vacío')

  const valid = (() => {
    switch (extension) {
      case '.pdf': return buffer.subarray(0, 5).toString('ascii') === '%PDF-'
      case '.jpg':
      case '.jpeg': return startsWithBytes(buffer, [0xff, 0xd8, 0xff])
      case '.png': return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      case '.webp': return buffer.length >= 12
        && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      case '.doc':
      case '.xls': return startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      case '.docx':
      case '.xlsx': {
        if (!startsWithBytes(buffer, [0x50, 0x4b])) return false
        const archive = buffer.toString('latin1')
        return archive.includes('[Content_Types].xml')
          && archive.includes(extension === '.docx' ? 'word/' : 'xl/')
      }
      case '.csv':
      case '.txt':
        if (buffer.includes(0)) return false
        try {
          new TextDecoder('utf-8', { fatal: true }).decode(buffer)
          return true
        } catch {
          return false
        }
      default: return false
    }
  })()

  if (!valid) throw new ValidationError('El contenido del archivo no coincide con su extensión')
}

function storagePath(storageKey: string) {
  const target = path.resolve(documentsRoot, storageKey)
  const relative = path.relative(documentsRoot, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new ForbiddenError('Ruta de documento inválida')
  return target
}

export class ClientDocumentService {
  async list(ctx: WorkspaceContext, companyId: string) {
    await ensureClientAccess(ctx, companyId)
    return db.clientDocument.findMany({
      where: { workspaceId: ctx.workspaceId, companyId },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async upload(
    ctx: WorkspaceContext,
    companyId: string,
    file: { filename: string; mimetype: string; buffer: Buffer },
    category?: string
  ) {
    await ensureClientAccess(ctx, companyId, 'write')
    const extension = path.extname(file.filename).toLowerCase()
    if (!allowedDocumentTypes.get(extension)?.has(file.mimetype.toLowerCase())) {
      throw new ValidationError('Tipo de documento no permitido')
    }
    validateDocumentContents(extension, file.buffer)
    const storageKey = path.posix.join(ctx.workspaceId, companyId, `${crypto.randomUUID()}${extension}`)
    const target = storagePath(storageKey)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file.buffer, { flag: 'wx' })
    try {
      return await db.clientDocument.create({
        data: {
          workspaceId: ctx.workspaceId,
          companyId,
          uploadedByUserId: ctx.userId,
          name: path.basename(file.filename).slice(0, 250),
          storageKey,
          mimeType: file.mimetype,
          sizeBytes: file.buffer.length,
          category,
        },
      })
    } catch (error) {
      await unlink(target).catch(() => undefined)
      throw error
    }
  }

  async download(ctx: WorkspaceContext, companyId: string, documentId: string) {
    await ensureClientAccess(ctx, companyId)
    const document = await db.clientDocument.findFirst({
      where: { id: documentId, workspaceId: ctx.workspaceId, companyId },
    })
    if (!document) throw new NotFoundError('Documento', documentId)
    const target = storagePath(document.storageKey)
    await stat(target).catch(() => { throw new NotFoundError('Archivo del documento', documentId) })
    return { document, stream: createReadStream(target) }
  }

  async remove(ctx: WorkspaceContext, companyId: string, documentId: string) {
    if (!canManageAllClients(ctx)) throw new ForbiddenError('Solo owner o admin pueden eliminar documentos')
    await ensureClientAccess(ctx, companyId, 'write')
    const document = await db.clientDocument.findFirst({
      where: { id: documentId, workspaceId: ctx.workspaceId, companyId },
    })
    if (!document) throw new NotFoundError('Documento', documentId)
    await db.clientDocument.delete({ where: { id: document.id } })
    await unlink(storagePath(document.storageKey)).catch(() => undefined)
  }
}
