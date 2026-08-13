import { randomInt } from 'node:crypto'
import { db } from '../../core/database'
import { Prisma } from '@prisma/client'

export function createLeadNumberCandidate() {
  return String(randomInt(10_000_000, 100_000_000))
}

export async function generateUniqueLeadNumber(workspaceId: string) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = createLeadNumberCandidate()
    const existing = await db.deal.findFirst({
      where: { workspaceId, leadNumber: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
  }

  throw new Error('No se pudo generar un numero de lead unico.')
}

export async function createWithUniqueLeadNumber<T>(workspaceId: string, create: (leadNumber: string) => Promise<T>) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const leadNumber = await generateUniqueLeadNumber(workspaceId)
    try {
      return await create(leadNumber)
    } catch (error) {
      const target = error instanceof Prisma.PrismaClientKnownRequestError ? String(error.meta?.target ?? '') : ''
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && target.includes('leadNumber')) continue
      throw error
    }
  }
  throw new Error('No se pudo reservar un numero de lead unico.')
}
