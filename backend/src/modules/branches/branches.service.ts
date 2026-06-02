import { db } from '../../core/database'
import { NotFoundError, ValidationError } from '../../types'
import { type Prisma } from '@prisma/client'

type Branch = Prisma.BranchGetPayload<{ include: { region: true } }>

export class BranchService {
  async list(workspaceId: string, regionId?: string): Promise<Branch[]> {
    return db.branch.findMany({
      where: {
        workspaceId,
        ...(regionId && { regionId }),
      },
      include: { region: true },
      orderBy: { name: 'asc' },
    })
  }

  async findById(workspaceId: string, id: string): Promise<Branch> {
    const branch = await db.branch.findFirst({
      where: { id, workspaceId },
      include: { region: true },
    })
    if (!branch) throw new NotFoundError('Branch', id)
    return branch
  }

  async create(
    workspaceId: string,
    data: { regionId: string; name: string; address?: string | null }
  ): Promise<Branch> {
    // Verificar que la región existe y pertenece al workspace
    const region = await db.region.findFirst({
      where: { id: data.regionId, workspaceId },
    })
    if (!region) throw new ValidationError(`La región especificada no existe en este workspace: ${data.regionId}`)

    const branch = await db.branch.create({
      data: {
        workspaceId,
        regionId: data.regionId,
        name: data.name,
        address: data.address ?? null,
      },
      include: { region: true },
    })
    return branch
  }

  async update(
    workspaceId: string,
    id: string,
    data: { regionId?: string; name?: string; address?: string | null; isActive?: boolean }
  ): Promise<Branch> {
    const existing = await db.branch.findFirst({
      where: { id, workspaceId },
    })
    if (!existing) throw new NotFoundError('Branch', id)

    if (data.regionId) {
      const region = await db.region.findFirst({
        where: { id: data.regionId, workspaceId },
      })
      if (!region) throw new ValidationError(`La región especificada no existe: ${data.regionId}`)
    }

    const updated = await db.branch.update({
      where: { id },
      data: {
        ...(data.regionId !== undefined && { regionId: data.regionId }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: { region: true },
    })
    return updated
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const existing = await db.branch.findFirst({
      where: { id, workspaceId },
    })
    if (!existing) throw new NotFoundError('Branch', id)

    await db.branch.delete({
      where: { id },
    })
  }
}
