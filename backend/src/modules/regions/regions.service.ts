import { db } from '../../core/database'
import { NotFoundError } from '../../types'
import { type Prisma } from '@prisma/client'

type Region = Prisma.RegionGetPayload<{ include: { branches: true } }>

export class RegionService {
  async list(workspaceId: string): Promise<Region[]> {
    return db.region.findMany({
      where: { workspaceId },
      include: { branches: true },
      orderBy: { name: 'asc' },
    })
  }

  async findById(workspaceId: string, id: string): Promise<Region> {
    const region = await db.region.findFirst({
      where: { id, workspaceId },
      include: { branches: true },
    })
    if (!region) throw new NotFoundError('Region', id)
    return region
  }

  async create(workspaceId: string, name: string): Promise<Region> {
    const region = await db.region.create({
      data: {
        workspaceId,
        name,
      },
      include: { branches: true },
    })
    return region
  }

  async update(workspaceId: string, id: string, name: string): Promise<Region> {
    const existing = await db.region.findFirst({
      where: { id, workspaceId },
    })
    if (!existing) throw new NotFoundError('Region', id)

    const updated = await db.region.update({
      where: { id },
      data: { name },
      include: { branches: true },
    })
    return updated
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const existing = await db.region.findFirst({
      where: { id, workspaceId },
    })
    if (!existing) throw new NotFoundError('Region', id)

    await db.region.delete({
      where: { id },
    })
  }
}
