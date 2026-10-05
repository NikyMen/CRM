import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_KEY_PREFIX: z.string().default('crm'),
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: z.string().min(1).optional(),
  WHATSAPP_AUTH_DIR: z.string().optional(),
  WHATSAPP_MEDIA_DIR: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = parsed.data
export type Config = typeof config
