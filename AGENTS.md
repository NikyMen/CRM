# AGENTS.md

## Forma de trabajo

- Sé directo y brutalmente honesto: no presentes una pantalla como funcional si la API no existe.
- Preservá cambios locales y evitá refactors ajenos al pedido.
- Usá exclusivamente `pnpm`; no agregues lockfiles ni dependencias sin justificar.
- Nunca muestres ni versiones `.env`, claves, tokens, sesiones, medios, documentos o datos de clientes.
- Los identificadores técnicos `crm`, rutas y nombres históricos se conservan por compatibilidad. La marca visible es **Gestión ROMEZ**.

## Producto actual

Monorepo para un estudio contable paraguayo:

- `backend`: Fastify 5 + Prisma 5 + PostgreSQL + BullMQ/Redis + JWT.
- `frontend`: Next.js 16 + React 19 + Tailwind 4 + TanStack Query + Axios.
- Producto: Inicio, Clientes, Gestión comercial, Cobranzas, Atención al cliente, Tickets, Equipo y Configuración.
- Configuración funcional: PYG, `es-PY`, `America/Asuncion`, RUC/DV y DNIT. No hay integración con DNIT, Marangatu ni SIFEN y no se almacenan sus credenciales.
- Un único WhatsApp compartido por QR/Baileys. Inbox/Meta/Chatwoot están deshabilitados por defecto con `ENABLE_LEGACY_CHANNELS=false`.
- Registro público y Stock no forman parte del runtime expuesto.

## Estructura clave

- `backend/src/app.ts`: composición, seguridad, plugins y rutas.
- `backend/prisma/schema.prisma`: modelo canónico.
- `backend/prisma/migrations`: historial obligatorio de producción.
- `backend/src/core/auth/portfolio-visibility.ts`: reglas comunes de cartera.
- `backend/src/modules/clients`: clientes contables; reutiliza internamente `Company`.
- `backend/src/modules/checklists`: plantillas e instancias periódicas.
- `backend/src/modules/collections`: cargos, planes, pagos, aplicaciones e importación.
- `backend/src/modules/tickets`: bandejas, asignación atómica, estados, reply y auditoría.
- `backend/src/modules/customer-service`: métricas de atención.
- `backend/src/modules/whatsapp`: sesión QR, mensajes, medios y sincronización con tickets.
- `backend/src/modules/bootstrap`: alta idempotente del owner y espacio ROMEZ.
- `frontend/lib/api.ts`: cliente Axios y contratos de API.
- `frontend/lib/auth.ts`: sesión JWT en `localStorage`; no hay auth SSR/cookies.
- `frontend/components/romez`: UI compartida de Gestión ROMEZ.
- `docs/obsidian`: vault canónico con mapas Mermaid y Canvas.
- `ops`: PM2, Nginx, Traefik, respaldo, restauración y migraciones.

## Comandos

```bash
pnpm install
pnpm dev
pnpm --filter crm build
pnpm --filter crm test
pnpm --filter frontend lint
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend build
pnpm acceptance
```

- Backend: `http://localhost:3000`, API `/api/v1`, salud `/health`.
- Frontend: `http://localhost:3001`.
- Prisma siempre exige `DATABASE_URL` y `DIRECT_URL`.
- No usar `prisma db push` en producción; usar `prisma migrate deploy`.

## Auth, roles y cartera

- Roles: `owner`, `admin`, `member`, `viewer`.
- owner/admin ven y asignan todo.
- member ve propios, colaboraciones y libres; tomar/liberar trabajo debe ser explícito.
- viewer sólo consulta cartera propia o colaboraciones asignadas.
- Toda consulta/escritura debe limitarse por `workspaceId` y cartera; validar IDs relacionados dentro del mismo workspace.
- API keys son sólo para rutas inbound; Equipo, API keys, webhooks y conexión WhatsApp requieren los roles definidos en backend.
- Normalizar emails con `trim().toLowerCase()` en todos los puntos de entrada.

## Contratos importantes

- Dinero: Prisma `Decimal`; exponer y enviar montos como strings. PYG no admite fracciones. No sumar monedas distintas ni convertir automáticamente.
- Fechas de negocio: días calendario de Paraguay; no usar `toISOString()` para producir fechas locales.
- Cliente: `Company` se expone como `Client`; `Contact` representa personas/teléfonos y puede vincularse al cliente.
- Tickets: sólo uno activo por conversación; CLOSED libera la conversación, RESOLVED no. La toma es compare-and-set atómica.
- Un mensaje entrante aceptado por el canal QR debe persistirse y generar/actualizar ticket. Los envíos directos sin `ticketId` están bloqueados.
- Eventos vivos/webhooks: `ticket.created`, `ticket.updated`, `collection.updated`, `checklist.updated` además de los históricos.
- Archivos: multipart protegido, límites configurables, ruta contenida, MIME/extensión/magic bytes y descarga autenticada.

## Variables relevantes

- Obligatorias: `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `JWT_SECRET`.
- Producto: `HOST`, `APP_TIMEZONE`, `DEFAULT_CURRENCY`, `GLOBAL_RATE_LIMIT_MAX`, `ALLOW_PUBLIC_REGISTRATION`, `ENABLE_LEGACY_CHANNELS`.
- Archivos/WhatsApp: `UPLOAD_MAX_BYTES`, `CLIENT_DOCUMENTS_DIR`, `WHATSAPP_AUTH_DIR`, `WHATSAPP_MEDIA_DIR`.
- Bootstrap sin defaults: `ROMEZ_OWNER_EMAIL`, `ROMEZ_OWNER_PASSWORD`, `ROMEZ_OWNER_FIRST_NAME`, `ROMEZ_OWNER_LAST_NAME`.
- Opcionales: `N8N_RESET_WEBHOOK_URL`, `SENTRY_DSN`.

## Producción

- Alias SSH: `farmacia`; repo actual `/var/www/crm`.
- Dominio previsto: `https://romez.consultoriadigital.io`.
- Topología objetivo: PostgreSQL/Redis dedicados en Docker sobre loopback; backend y frontend en PM2; una sola instancia backend; Nginx detrás de Traefik.
- Ejecutar PM2 y la aplicación como usuario Unix dedicado `romez`, nunca como `root`; limitar escritura a `.data` y logs.
- No detener PostgreSQL ni Redis del host: son compartidos por otros servicios.
- No reemplazar la aplicación vieja hasta validar la nueva en paralelo.
- Antes de reiniciar datos: detener escrituras, respaldar, verificar hashes, descargar segunda copia y probar restauración.

## Evidencia al 2026-08-30

- Rama de trabajo: `codex/gestion-romez`; base `197267c`, PR #1 de Facu ya fusionada.
- Backend: build correcto y 51 pruebas automatizadas en verde.
- Frontend: ESLint sin errores, TypeScript correcto y build de 28 rutas.
- Dependencias productivas: auditoría sin vulnerabilidades críticas ni altas; quedan 3 moderadas transitivas.
- Migraciones: despliegue limpio verificado en PostgreSQL 16 temporal, 10 migraciones y 41 tablas.
- Respaldo canónico verificado: `/var/www/crm/backups/romez-pre-reset-20260830T020857Z`; segunda copia externa verificada; restauración temporal y conteos correctos.
- El dump histórico presenta deriva de `_prisma_migrations`; el plan autorizado es base nueva limpia, no una migración in-place de esa base.
- Producción nueva todavía no está publicada: faltan DNS A, variables `ROMEZ_OWNER_*` y escaneo presencial del QR.

## Verificación mínima por cambio

- Backend: build y pruebas relevantes.
- Frontend: lint, `tsc --noEmit` y build.
- Prisma: schema + migración; probar en una base vacía.
- Cambios cruzados: comparar Zod, respuestas, wrappers Axios y tipos frontend.
- WhatsApp/tickets: validar persistencia, aislamiento, carrera de toma, reply, cierre y ticket siguiente.
- Cobranzas: validar precisión Decimal, pagos parciales, anulaciones, duplicados y monedas separadas.
- No afirmar despliegue, HTTPS, login real o WhatsApp real sin evidencia ejecutada.
