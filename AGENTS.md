# AGENTS.md

## Actitud

- Se brutalmente honesto.
- No inventes funcionamiento que no exista en el codigo.
- Si algo no esta implementado, esta roto o solo parece funcionar en UI, dejalo dicho.

## Que es este repo

- Monorepo `pnpm` con dos apps reales:
  - `backend`: API CRM en Fastify + Prisma + PostgreSQL + BullMQ/Redis.
  - `frontend`: app Next.js App Router que consume esa API.
- Tambien hay assets de agentes/skills en `.agent`, `.agents` y `.claude`. Eso no es parte del runtime del CRM.
- `src/skills/frontend-skills.ts` existe pero esta vacio; hoy no aporta nada al producto.

## Estructura rapida

- `package.json`: scripts raiz para levantar backend + frontend juntos.
- `backend/src/app.ts`: composicion principal de Fastify, plugins, manejo global de errores y registro de rutas.
- `backend/src/server.ts`: entrypoint local del backend.
- `backend/api/index.ts`: handler serverless para Vercel.
- `backend/prisma/schema.prisma`: modelo de datos entero.
- `frontend/app`: rutas App Router.
- `frontend/lib/api.ts`: cliente Axios compartido y wrappers de endpoints.
- `frontend/lib/auth.ts`: sesion guardada en `localStorage`.
- `frontend/types/index.ts`: contratos frontend. No asumir que siempre coinciden con backend.

## Stack real

- Frontend:
  - Next.js 16
  - React 19
  - Tailwind 4
  - TanStack Query
  - Axios
  - `next-themes`
  - `dnd-kit` para el kanban
- Backend:
  - Fastify 5
  - Prisma 5
  - PostgreSQL
  - BullMQ + Redis
  - JWT
  - Zod
  - Sentry opcional

## Como correrlo

- Raiz:
  - `pnpm dev`: backend + frontend en paralelo.
  - `pnpm dev:backend`
  - `pnpm dev:frontend`
- Frontend:
  - puerto esperado: `3001`
  - API esperada: `NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1`
- Backend:
  - puerto esperado: `3000`
  - health check: `/health`
  - API base: `/api/v1`

## Variables de entorno

- `frontend/.env.example`
  - `NEXT_PUBLIC_API_URL`
- `backend/.env.example`
  - `DATABASE_URL`
  - `REDIS_URL`
  - `JWT_SECRET`
  - `PORT`
  - `NODE_ENV`
  - `API_KEY_PREFIX`
  - `FRONTEND_URL`
- Variables usadas en codigo pero no reflejadas bien en ejemplos:
  - `DIRECT_URL`: Prisma la usa en `schema.prisma`, pero no esta en `backend/.env.example`.
  - `N8N_RESET_WEBHOOK_URL`: usada para forgot-password.
  - `SENTRY_DSN`: usada por Sentry.

## Arquitectura backend

- Toda la API es multi-tenant por `workspaceId`.
- Auth:
  - JWT para usuarios.
  - `X-API-Key` para integraciones.
- Roles reales:
  - `owner`, `admin`, `member`, `viewer`
- Modulos principales:
  - `auth`: registro, login, `me`, API keys, equipo, forgot/reset password.
  - `contacts`: CRUD, busqueda, merge, lead scoring y eventos.
  - `deals`: CRUD, kanban, move entre stages y eventos.
  - `pipelines`: CRUD de pipelines y stages.
  - `activities`: historial manual sobre contactos.
  - `notes`: notas privadas sobre contactos.
  - `webhooks`: configuracion y test de endpoints externos.
  - `dashboard`: metricas agregadas.
  - `inbound`: endpoints para n8n/integraciones via API key.
- `EventBus`:
  - En desarrollo usa fallback en memoria.
  - En produccion encola webhooks en BullMQ y persiste `event_logs`.

## Modelo de datos

- Prisma modela:
  - `Workspace`, `User`, `WorkspaceUser`
  - `Contact`
  - `Pipeline`, `Stage`, `Deal`, `DealContact`
  - `Activity`, `Note`
  - `WebhookEndpoint`
  - `ApiKey`
  - `EventLog`
- El onboarding crea:
  - usuario
  - workspace
  - membership owner
  - pipeline por defecto con 6 etapas

## Arquitectura frontend

- Casi todo es client-side.
- La sesion vive en `localStorage`; no hay auth SSR ni cookies.
- `frontend/app/(dashboard)/layout.tsx` hace guard client-side y renderiza sidebar.
- `frontend/lib/api.ts` mete el JWT en cada request con un interceptor de Axios.
- Pantallas principales implementadas:
  - login/register/forgot/reset
  - dashboard
  - contactos + detalle
  - deals + kanban por pipeline
  - pipelines
  - webhooks
  - API keys
  - team
- Tema:
  - light/dark con `next-themes`
  - toggle flotante global

## Donde mirar primero segun tarea

- Si se rompe auth o contexto de usuario:
  - `frontend/lib/auth.ts`
  - `frontend/lib/api.ts`
  - `backend/src/modules/workspaces/auth.routes.ts`
  - `backend/src/core/auth/auth.service.ts`
- Si falla algo de contactos:
  - `backend/src/modules/contacts/contact.routes.ts`
  - `backend/src/modules/contacts/contact.service.ts`
  - `frontend/app/(dashboard)/contacts/page.tsx`
  - `frontend/app/(dashboard)/contacts/[id]/page.tsx`
- Si falla el kanban:
  - `backend/src/modules/deals/deal.routes.ts`
  - `backend/src/modules/deals/deal.service.ts`
  - `frontend/app/(dashboard)/deals/[pipelineId]/page.tsx`
- Si falla automatizacion/webhooks:
  - `backend/src/core/event-bus/index.ts`
  - `backend/src/modules/webhooks/webhooks.routes.ts`
  - `backend/src/modules/inbound/inbound.routes.ts`
  - `frontend/app/(dashboard)/webhooks/page.tsx`

## Convenciones reales del repo

- Backend:
  - valida input con Zod adentro de cada ruta.
  - usa `authenticate` como hook o `preHandler`.
  - trabaja con soft delete en `contacts` y `deals`.
  - registra actividades y emite eventos de dominio.
- Frontend:
  - usa React Query para casi toda la data remota.
  - mezcla UI bastante pulida con varios textos hardcodeados.
  - depende de que los wrappers de `frontend/lib/api.ts` reflejen el backend.
- El README del frontend no es confiable; es el boilerplate de create-next-app.

## Trampas y deudas conocidas

- `backend/package.json` define `db:seed`, pero `backend/prisma/seed.ts` no existe.
- `backend/prisma/schema.prisma` exige `DIRECT_URL`, pero `backend/.env.example` no la documenta.
- `backend/src/modules/deals/deal.routes.ts` tiene un bug claro:
  - `GET /deals/:id` devuelve `service.search(...)` en vez de un deal puntual.
- `frontend/app/(dashboard)/webhooks/page.tsx` ofrece el evento `deal.moved`, pero el backend expone/emite `deal.stage_changed`.
- `frontend/types/index.ts` define `Webhook.successCount`, pero el backend no lo persiste ni lo devuelve.
- `frontend` y la raiz tienen lockfiles mezclados (`pnpm-lock.yaml` y `package-lock.json`); Next ya avisa que eso le ensucia la deteccion del workspace root.
- `backend/package.json` usa `start: node dist/server.js`, pero con el `tsconfig` actual el output esperado cae bajo `dist/src/...`.
- `backend/DockerFile` termina con `node dist/app.js`; por el mismo motivo, ese path parece incorrecto.
- `backend/src/types/fastify.d.ts` duplica `userId` en el tipo `user`.
- `frontend/app/(auth)/forgot-password/page.tsx` y reset usan una estetica distinta al resto; no es bug funcional, pero si inconsistencia visual.
- `skills` bajo `.agent`, `.agents` y `.claude` estan duplicadas; evitá tocarlas salvo trabajo explicito sobre tooling de agentes.

## Verificacion y expectativas

- Si vas a cambiar backend + frontend, no supongas que los tipos estan sincronizados: comparalos.
- Si tocas webhooks, activities o inbound, valida eventos exactos y nombres de payload.
- Si tocas build/deploy, revisa primero `backend/tsconfig.json`, `backend/package.json`, `backend/DockerFile`, `backend/vercel.json` y `frontend/next.config.ts`.
- Si algo "funciona en pantalla" pero no existe en la API, tratá eso como bug, no como feature.
