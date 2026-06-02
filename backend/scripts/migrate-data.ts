import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Iniciando migración de datos para regiones y sucursales ---')

  const workspaces = await prisma.workspace.findMany()
  console.log(`Encontrados ${workspaces.length} workspaces.`)

  for (const workspace of workspaces) {
    console.log(`\nProcesando workspace: "${workspace.name}" (ID: ${workspace.id})`)

    // 1. Verificar si ya existe alguna región
    let defaultRegion = await prisma.region.findFirst({
      where: { workspaceId: workspace.id },
    })

    if (!defaultRegion) {
      console.log('Creando región por defecto: "Región General"...')
      defaultRegion = await prisma.region.create({
        data: {
          workspaceId: workspace.id,
          name: 'Región General',
        },
      })
    } else {
      console.log(`Región existente encontrada: "${defaultRegion.name}" (ID: ${defaultRegion.id})`)
    }

    // 2. Verificar si ya existe alguna sucursal
    let defaultBranch = await prisma.branch.findFirst({
      where: { workspaceId: workspace.id, regionId: defaultRegion.id },
    })

    if (!defaultBranch) {
      console.log('Creando sucursal por defecto: "Casa Central"...')
      defaultBranch = await prisma.branch.create({
        data: {
          workspaceId: workspace.id,
          regionId: defaultRegion.id,
          name: 'Casa Central',
          address: 'Dirección General',
          isActive: true,
        },
      })
    } else {
      console.log(`Sucursal existente encontrada: "${defaultBranch.name}" (ID: ${defaultBranch.id})`)
    }

    // 3. Asignar usuarios que no tengan sucursal ni región asignada
    const usersToMigrate = await prisma.workspaceUser.findMany({
      where: {
        workspaceId: workspace.id,
        branchId: null,
      },
    })

    if (usersToMigrate.length > 0) {
      console.log(`Migrando ${usersToMigrate.length} usuarios a la sucursal "Casa Central" y "Región General"...`)
      const updateResult = await prisma.workspaceUser.updateMany({
        where: {
          workspaceId: workspace.id,
          branchId: null,
        },
        data: {
          branchId: defaultBranch.id,
          regionId: defaultRegion.id,
        },
      })
      console.log(`Asignados ${updateResult.count} usuarios.`)
    } else {
      console.log('No se encontraron usuarios sin sucursal asignada.')
    }

    // 4. Asignar deals que no tengan sucursal asignada
    const dealsToMigrate = await prisma.deal.findMany({
      where: {
        workspaceId: workspace.id,
        branchId: null,
      },
    })

    if (dealsToMigrate.length > 0) {
      console.log(`Migrando ${dealsToMigrate.length} deals a la sucursal "Casa Central"...`)
      const updateResult = await prisma.deal.updateMany({
        where: {
          workspaceId: workspace.id,
          branchId: null,
        },
        data: {
          branchId: defaultBranch.id,
        },
      })
      console.log(`Asignados ${updateResult.count} deals.`)
    } else {
      console.log('No se encontraron deals sin sucursal asignada.')
    }

    // 5. Asignar contactos que no tengan sucursal asignada
    const contactsToMigrate = await prisma.contact.findMany({
      where: {
        workspaceId: workspace.id,
        branchId: null,
      },
    })

    if (contactsToMigrate.length > 0) {
      console.log(`Migrando ${contactsToMigrate.length} contactos a la sucursal "Casa Central"...`)
      const updateResult = await prisma.contact.updateMany({
        where: {
          workspaceId: workspace.id,
          branchId: null,
        },
        data: {
          branchId: defaultBranch.id,
        },
      })
      console.log(`Asignados ${updateResult.count} contactos.`)
    } else {
      console.log('No se encontraron contactos sin sucursal asignada.')
    }
  }

  console.log('\n--- Migración de datos completada exitosamente ---')
}

main()
  .catch((e) => {
    console.error('Error durante la migración:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
