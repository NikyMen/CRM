import bcrypt from 'bcryptjs'
import { Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'

const bootstrapEnvSchema = z.object({
  ROMEZ_OWNER_EMAIL: z.string().trim().email(),
  ROMEZ_OWNER_PASSWORD: z.string().min(12),
  ROMEZ_OWNER_FIRST_NAME: z.string().trim().min(1).default('Administrador'),
  ROMEZ_OWNER_LAST_NAME: z.string().trim().optional(),
  ROMEZ_WORKSPACE_NAME: z.string().trim().min(1).default('ROMEZ Servicios Contables'),
  ROMEZ_WORKSPACE_SLUG: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).default('romez'),
})

export type BootstrapEnvironment = z.infer<typeof bootstrapEnvSchema>

const pipelineStages = [
  { name: 'Consulta recibida', position: 0, color: '#64748b', probability: 10 },
  { name: 'Calificación', position: 1, color: '#3b82f6', probability: 30 },
  { name: 'Propuesta enviada', position: 2, color: '#365aa9', probability: 60 },
  { name: 'Negociación', position: 3, color: '#f59e0b', probability: 80 },
  { name: 'Cliente activo', position: 4, color: '#16a34a', probability: 100, isWon: true },
  { name: 'No concretado', position: 5, color: '#dc2626', probability: 0, isLost: true },
]

const checklistTemplates = [
  {
    name: 'Cierre tributario mensual',
    periodicity: 'MONTHLY' as const,
    items: [
      'Recibir y ordenar comprobantes del período',
      'Conciliar compras, ventas y movimientos bancarios',
      'Preparar liquidaciones tributarias aplicables',
      'Revisar calendario de vencimientos de la DNIT',
      'Presentar declaraciones mediante Marangatu',
      'Archivar acuses y documentos de respaldo',
    ],
  },
  {
    name: 'Liquidación mensual de salarios',
    periodicity: 'MONTHLY' as const,
    items: [
      'Recibir novedades del personal',
      'Controlar asistencia, vacaciones y ausencias',
      'Preparar liquidación de salarios',
      'Revisar aportes y obligaciones laborales',
      'Enviar recibos y resumen al cliente',
    ],
  },
  {
    name: 'Cierre contable anual',
    periodicity: 'YEARLY' as const,
    items: [
      'Confirmar integridad de la documentación anual',
      'Conciliar cuentas patrimoniales y de resultados',
      'Preparar estados contables',
      'Revisar obligaciones anuales ante la DNIT',
      'Obtener aprobación y archivar presentación',
    ],
  },
  {
    name: 'Alta de cliente',
    periodicity: 'ON_DEMAND' as const,
    items: [
      'Validar identidad, RUC y dígito verificador',
      'Registrar datos fiscales y actividad económica',
      'Definir obligaciones y calendario de trabajo',
      'Asignar responsable y colaboradores',
      'Acordar honorarios y fecha de cobro',
      'Vincular contactos y conversación de WhatsApp',
    ],
  },
]

export function readBootstrapEnvironment(env: NodeJS.ProcessEnv): BootstrapEnvironment {
  const result = bootstrapEnvSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`Variables ROMEZ_OWNER_* inválidas: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`)
  }
  return result.data
}

export async function bootstrapRomez(prisma: PrismaClient, config: BootstrapEnvironment) {
  const existingWorkspace = await prisma.workspace.findUnique({ where: { slug: config.ROMEZ_WORKSPACE_SLUG } })
  const existingSettings = existingWorkspace?.settings && typeof existingWorkspace.settings === 'object' && !Array.isArray(existingWorkspace.settings)
    ? existingWorkspace.settings as Prisma.JsonObject
    : {}
  const settings = {
    ...existingSettings,
    locale: 'es-PY',
    currency: 'PYG',
    timezone: 'America/Asuncion',
    country: 'Paraguay',
    taxAuthority: 'DNIT',
    taxSystem: 'Marangatu',
  } satisfies Prisma.InputJsonObject

  const workspace = await prisma.workspace.upsert({
    where: { slug: config.ROMEZ_WORKSPACE_SLUG },
    update: { name: config.ROMEZ_WORKSPACE_NAME, settings },
    create: { name: config.ROMEZ_WORKSPACE_NAME, slug: config.ROMEZ_WORKSPACE_SLUG, settings },
  })

  const email = config.ROMEZ_OWNER_EMAIL.toLowerCase()
  const existingUser = await prisma.user.findUnique({ where: { email } })
  const passwordHash = await bcrypt.hash(config.ROMEZ_OWNER_PASSWORD, 12)
  const user = existingUser ?? await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: config.ROMEZ_OWNER_FIRST_NAME,
      lastName: config.ROMEZ_OWNER_LAST_NAME,
    },
  })
  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        firstName: config.ROMEZ_OWNER_FIRST_NAME,
        lastName: config.ROMEZ_OWNER_LAST_NAME,
      },
    })
  }

  await prisma.workspaceUser.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role: 'owner' },
    create: { workspaceId: workspace.id, userId: user.id, role: 'owner' },
  })

  let pipeline = await prisma.pipeline.findFirst({ where: { workspaceId: workspace.id, name: 'Gestión Comercial ROMEZ' } })
  if (!pipeline) {
    await prisma.pipeline.updateMany({ where: { workspaceId: workspace.id }, data: { isDefault: false } })
    pipeline = await prisma.pipeline.create({
      data: {
        workspaceId: workspace.id,
        name: 'Gestión Comercial ROMEZ',
        isDefault: true,
        stages: { create: pipelineStages },
      },
    })
  }

  for (const template of checklistTemplates) {
    const existing = await prisma.checklistTemplate.findUnique({
      where: { workspaceId_name: { workspaceId: workspace.id, name: template.name } },
    })
    if (!existing) {
      await prisma.checklistTemplate.create({
        data: {
          workspaceId: workspace.id,
          name: template.name,
          periodicity: template.periodicity,
          items: {
            create: template.items.map((title, position) => ({ title, position, isRequired: true })),
          },
        },
      })
    }
  }

  return { workspaceId: workspace.id, ownerId: user.id, pipelineId: pipeline.id }
}
