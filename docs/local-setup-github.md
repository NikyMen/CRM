# Entorno local y push seguro

Esta guia deja el proyecto listo para trabajar localmente y subirlo a GitHub sin secretos.

## Setup local

1. Instalar dependencias desde la raiz:

```bash
pnpm install
```

2. Crear variables locales:

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env.local
```

3. Completar `backend\.env` con valores reales solo en tu maquina:

- `DATABASE_URL` y `DIRECT_URL`
- `REDIS_URL`
- `JWT_SECRET` con al menos 32 caracteres
- `FRONTEND_URL=http://localhost:3001`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`
- `CHATWOOT_*` si se usa Chatwoot

4. Preparar Prisma cuando la base local este disponible:

```bash
pnpm --filter crm db:generate
pnpm --filter crm db:push
```

5. Levantar el CRM:

```bash
pnpm dev
```

Frontend queda en `http://localhost:3001` y backend en `http://localhost:3000`.

## GitHub seguro

Antes de pushear:

```bash
git status --short
git diff -- . ":(exclude)**/.env" ":(exclude)**/.env.*"
```

No deben aparecer archivos `.env`, `.data`, dumps de base, tokens, claves privadas ni sesiones de WhatsApp.

Si Git en Windows muestra `detected dubious ownership`, ejecutar una sola vez:

```bash
git config --global --add safe.directory C:/dev/CRM
```

## Archivos ignorados

El repo ignora:

- `.env` y `.env.*`, manteniendo versionables solo `.env.example`
- `node_modules`, `dist`, `.next`, `.turbo`
- `.data`, `backend/.data`, sesiones y media local de WhatsApp
- logs, coverage, reportes de pruebas y caches locales

## API Meta

La nueva seccion del CRM vive en `/api-meta`.

Endpoints backend:

- `GET /api/v1/meta-api/status`
- `GET /api/v1/meta-api/connections`
- `POST /api/v1/meta-api/connections`
- `PATCH /api/v1/meta-api/connections/:id`
- `DELETE /api/v1/meta-api/connections/:id`
- `POST /api/v1/meta-api/connections/:id/test`
- `POST /api/v1/meta-api/connections/:id/whatsapp/register`
- `GET /api/v1/meta-api/embedded-signup/config`
- `POST /api/v1/meta-api/embedded-signup/complete`
- `POST /api/v1/meta-api/embedded-signup/complete-code`
- `GET /api/v1/meta-api/webhook`
- `POST /api/v1/meta-api/webhook`

Los `accessToken` de clientes se aceptan por backend y no se devuelven al frontend. Para produccion real conviene cifrarlos en base de datos o moverlos a un vault.
