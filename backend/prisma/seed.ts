import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // Crear workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'mi-empresa' },
    update: {},
    create: {
      name: 'Mi Empresa',
      slug: 'mi-empresa',
      plan: 'free',
    },
  })
  console.log(`✅ Workspace creado: ${workspace.name} (${workspace.id})`)

  // Crear usuario admin
  const passwordHash = await bcrypt.hash('admin1234', 10)

  const user = await prisma.user.upsert({
    where: { email: 'admin@miempresa.com' },
    update: {},
    create: {
      email: 'admin@miempresa.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'CRM',
    },
  })
  console.log(`✅ Usuario creado: ${user.email}`)

  // Vincular usuario al workspace como owner
  await prisma.workspaceUser.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'owner',
    },
  })
  console.log(`✅ Usuario vinculado al workspace como owner`)

  // Crear pipeline por defecto
  const pipeline = await prisma.pipeline.upsert({
    where: { id: 'pipeline-default' },
    update: {},
    create: {
      id: 'pipeline-default',
      workspaceId: workspace.id,
      name: 'Pipeline Principal',
      isDefault: true,
    },
  })
  console.log(`✅ Pipeline creado: ${pipeline.name}`)

  // Crear etapas del pipeline
  const stages = [
    { name: 'Nuevo Lead', position: 0, color: '#6366f1' },
    { name: 'Contactado', position: 1, color: '#f59e0b' },
    { name: 'Propuesta', position: 2, color: '#3b82f6' },
    { name: 'Negociación', position: 3, color: '#8b5cf6' },
    { name: 'Ganado', position: 4, color: '#10b981', isWon: true },
    { name: 'Perdido', position: 5, color: '#ef4444', isLost: true },
  ]

  for (const stage of stages) {
    await prisma.stage.create({
      data: {
        pipelineId: pipeline.id,
        ...stage,
      },
    })
  }
  console.log(`✅ ${stages.length} etapas creadas`)

  console.log('\n🎉 Seed completado exitosamente!')
  console.log('─────────────────────────────────')
  console.log('📧 Email:    admin@miempresa.com')
  console.log('🔑 Password: admin1234')
  console.log('─────────────────────────────────')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })