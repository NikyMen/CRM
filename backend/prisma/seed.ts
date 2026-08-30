import { PrismaClient } from '@prisma/client'
import {
  bootstrapRomez,
  readBootstrapEnvironment,
} from '../src/modules/bootstrap/bootstrap.service'

const prisma = new PrismaClient()

async function main() {
  const config = readBootstrapEnvironment(process.env)
  const result = await bootstrapRomez(prisma, config)
  console.log(`Bootstrap ROMEZ completo. Workspace: ${result.workspaceId}. Owner: ${result.ownerId}.`)
}

main()
  .catch((error: unknown) => {
    console.error('Bootstrap ROMEZ falló:', error instanceof Error ? error.message : 'Error desconocido')
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
