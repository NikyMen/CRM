import { z } from 'zod'

const optionalString = (schema: z.ZodString) =>
  z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    schema.optional()
  )

const optionalPositiveInt = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.coerce.number().int().positive().optional()
)

const booleanFromEnv = z.preprocess(
  (value) => typeof value === 'string' ? value.trim().toLowerCase() : value,
  z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
)

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_KEY_PREFIX: z.string().default('crm'),
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),
  APP_TIMEZONE: z.string().default('America/Asuncion'),
  DEFAULT_CURRENCY: z.string().length(3).default('PYG'),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().min(300).max(10_000).default(1500),
  ALLOW_PUBLIC_REGISTRATION: booleanFromEnv.default(false),
  ENABLE_LEGACY_CHANNELS: booleanFromEnv.default(false),
  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1_048_576).max(25_000_000).default(10_485_760),
  CLIENT_DOCUMENTS_DIR: optionalString(z.string().min(1)),
  N8N_RESET_WEBHOOK_URL: optionalString(z.string().url()),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: z.string().min(1).optional(),
  WHATSAPP_AUTH_DIR: z.string().optional(),
  WHATSAPP_MEDIA_DIR: z.string().optional(),
  CHATWOOT_BASE_URL: optionalString(z.string().url()),
  CHATWOOT_ACCOUNT_ID: optionalPositiveInt,
  CHATWOOT_API_ACCESS_TOKEN: optionalString(z.string().min(1)),
  CHATWOOT_MESSENGER_INBOX_ID: optionalPositiveInt,
  CHATWOOT_INSTAGRAM_INBOX_ID: optionalPositiveInt,
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = parsed.data
export type Config = typeof config
